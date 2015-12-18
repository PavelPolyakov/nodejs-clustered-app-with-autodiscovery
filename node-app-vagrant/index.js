'use strict';

const os = require('os');
const ifaces = os.networkInterfaces();
const config = require('config');
const _ = require('lodash');
const uuid = require('node-uuid');
const Etcd = require('node-etcd');
const Promise = require('bluebird');
const Discover = require('node-discover');
const moniker = require('moniker');
const moment = require('moment');
const debug = {
    app: require('debug')('node-app'),
    master: require('debug')('master'),
    cluster: require('debug')('cluster'),
    worker: require('debug')('worker')
};
const DATE_FORMAT = config.get('dateFormat');

// helper function, returns our own external IP (the one which is makes us available for the PC)
function _getIP() {
    return _.filter(ifaces['eth1'], (record)=> {
        return record.family === 'IPv4';
    }).pop().address;
}

// app node object
let appNode = {
    id: `${moniker.choose()}-${uuid.v4()}`,
    d: undefined, // holder for the discovery service
    intervals: {}, // holder for the possible intervals
    /**
     * init the discovery service
     * @param {Array} nodes array of the unicast IPs
     */
    init: function (nodes) {
        this.d = new Discover({port: config.get('port'), address: _getIP(), unicast: nodes});

        this.d.broadcast.instanceUuid = this.id; // redefine the node id, make it more pretty

        debug.worker(`My id: ${this.id}`);

        // add adv information
        this.d.advertise({});

        // what to do if this node was elected as master
        this.d.on("promotion", (obj) => {
            debug.master(`I was promoted to a master. ${this.id}`);

            // leave tasks channel
            this.d.leave('tasks');

            this.intervals.master = setInterval(() => {
                // do not generate messages in case there are no nodes to process
                if (_.keys(this.d.nodes).length === 0) {
                    debug.master(`${moment().format(DATE_FORMAT)} no nodes, skip task generation :(`);

                    return;
                }

                /**
                 * Load balancer, should return the id of the node, which would execute the task
                 * @param nodes
                 */
                function balance(nodes) {
                    let keys = _.keys(nodes);

                    // choose random node as executor
                    let random = _.random(0, keys.length - 1);
                    return nodes[keys[random]];
                }

                // each task is unique, but we choose one executor
                let task = {
                    uuid: uuid.v4(),
                    executor: balance(this.d.nodes).id,
                    number: _.random(30, 60)
                };
                this.d.send('tasks', task);

                debug.master(`${moment().format(DATE_FORMAT)} task was sent:`);
                debug.master(task);
            }, 10 * 1000);
        });

        // what to do if this node is not master anymore
        this.d.on("demotion", (obj) => {
            debug.cluster(`I was demoted. ${this.id}`);

            clearInterval(this.intervals.master);
        });

        // what to do if another node was added
        this.d.on("added", (obj) => {
            debug.cluster(`A new node has been added. ${obj.id}`);
        });

        // what to do if another node was removed
        this.d.on("removed", (obj) => {
            debug.cluster(`Node removed from the network. ${obj.id})}`);
        });

        // interval which prints currently available nodes each 15 seconds
        this.intervals.nodesInfo = setInterval(() => {
            debug.cluster(`${moment().format(DATE_FORMAT)} nodes info`);
            debug.cluster("me:");
            debug.cluster(`hostName: ${os.hostname()}, address: ${this.d.me.address}, isMaster: ${this.d.me.isMaster}, uuid: ${this.id}`);

            debug.cluster(`Nodes(${_.keys(this.d.nodes).length}):`);

            this.d.eachNode((node) => {
                debug.cluster(`hostName: ${node.hostName}, address: ${node.address}, isMaster: ${node.isMaster}, uuid: ${node.id}`);
            });
        }, 60 * 1000);

        // join tasks channel, by default
        this.d.join('tasks', (data) => {
            // do not do anything, if we are master
            if (this.d.me.isMaster) {
                return;
            }

            // this message is not for us
            if (data.executor !== this.id) {
                return;
            }

            debug.worker(`${moment().format(DATE_FORMAT)} got message:`);
            debug.worker(data);

            let startMoment = moment();
            // do some complex Math, calculation could last from 1 to 15 seconds
            setTimeout(()=> {
                let finishMoment = moment();
                let result = {uuid: data.uuid, result: data.number * 3};

                debug.worker(`${moment().format(DATE_FORMAT)} message was processed with the result:`);
                debug.worker(result);

                this.d.send('results', _.merge(result, {
                    start: startMoment.format(DATE_FORMAT),
                    finish: finishMoment.format(DATE_FORMAT)
                }));
            }, _.random(1, 15) * 1000);
        });

        // join tasks channel, by default
        this.d.join('results', (data) => {
            // do not do anything, if we are master
            if (!this.d.me.isMaster) {
                return;
            }

            debug.master(`${moment().format(DATE_FORMAT)} got message:`);
            debug.master(data);
        });

    },
    /**
     * stop all the current interaction and init another discovery service
     * @param {Array} nodes array of the unicast IPs, would be passed further
     */
    change: function (nodes) {
        // demote, if we were master
        this.d.demote();
        // stop every interaction
        this.d.stop();

        // clear all the possible intervals
        _.keys(this.intervals).forEach((key) => {
            clearInterval(this.intervals[key]);
        });

        // re-init
        debug.cluster('reinit');
        this.init(nodes);
    }
};

// init and support etcd interaction
Promise.coroutine(function *() {
    const etcd = new Etcd(config.get('etcd'), {timeout: 1000});

    let IP = _getIP();
    let currentServices = [];
    debug.app(`my IP: ${IP}`);
    debug.app(`etcd addresses: ${config.get('etcd')}`);

    // write ourselves to the registry of the available services
    yield Promise.promisify(etcd.set, {context: etcd})(`services/${IP}`, `${IP}`, {ttl: config.get('ttl')});

    // each 60 seconds - show that we are not dead
    setInterval(() => {
        Promise.promisify(etcd.set, {context: etcd})(`services/${IP}`, `${IP}`, {ttl: config.get('ttl')});
    }, config.get('ttl') / 2 * 1000);

    // watch the /services directory, to act on update
    // explicitly set watcher to observe since the index 1
    let watcher = etcd.watcher('services', 1, {recursive: true});

    // we should track each change
    watcher.on('change', () => {
        Promise.coroutine(function *() {
            // get the list of the services available after the update
            let services = yield Promise.promisify(etcd.get, {context: etcd})('services');
            let updatedServices = _.pluck(services.node.nodes, 'value');

            // if the list of the new services is not equal to the one we stored - reinit the discovery service
            if (!_.isEqual(currentServices.sort(), updatedServices.sort())) {
                // check if it's init change
                if(currentServices.length === 0) {
                    currentServices = updatedServices;
                    // init the discovery for the first time
                    debug.app('Init the appNode');
                    appNode.init(currentServices);
                } else {
                    currentServices = updatedServices;

                    debug.app(`new: ${JSON.stringify(currentServices, 'value')}`);

                    // call the appropriate method of the appNode
                    debug.app('Notifying the appNode about the change');
                    appNode.change(currentServices);
                }
            }
        })();
    });
})().catch((error) => {
    require('debug')('error')(error.toString());
    process.exit();
});