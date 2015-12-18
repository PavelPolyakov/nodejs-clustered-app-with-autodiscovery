# About

This project is an attempt to build the proof of concept of node.js auto discoverable cluster.
It's possible, that nodes of the cluster could be located in the different networks.

Next technologies are used:
* [Vagrant](https://www.vagrantup.com/) (for virtualization, at least version 1.7.4)
* [etcd](https://github.com/coreos/etcd) (to store the registry of the active nodes)
* [node-discover](https://github.com/wankdanker/node-discover) (auto discovery framework)

## To run the app the next should be done
1. Vagrant >= 1.7.4 should be installed
2. Assuming you are going to setup the project to the folder `/Users/user/etcd-test`
3. Checking out the git repository
 
 ```bash
cd /Users/user/
mkdir etcd-test 
cd etcd-test
git clone https://github.com/PavelPolyakov/etcd-test.git .
```
4. Preparing the etcd machine
 
 ```bash
cd /Users/user/etcd-test/
cd etcd-vagrant
vagrant up
./IP.sh
# write down the IP and port of the etcd server
# let's assume that it is 172.28.128.22:4001
```
 Using the UI url - you can examine the current etcd content.
 ![](http://i.imgur.com/67Qrh0U.png)
5. Prepare the node machines
 
 ```bash
cd /Users/user/etcd-test/
cd node-app-vagrant
cd config
cp default.js.sample default.js
vi default.js # here we need to put the actiaul etcd server IP:port to the etcd section of the config, instead of the example one
# let's assume, that the we have adjusted the config
cd ..
vagrant up
```
 During the machine instantiating, Vagrant would prepare three servers - A,B,C.
 Each server is able to run the node-app node, all together they should build up a cluster.
6. After some time, the machines would be instantiated. It's time to run the application.
 Let's open three terminals - one per app. 
 
 **A:**
 ```bash
vagrant ssh A
cd node-app
npm run app
```
 **B:**
 ```bash
vagrant ssh B
cd node-app
npm run app
```
 **C:**
 ```bash
vagrant ssh C
cd node-app 
npm run app
```
 In case we did everyhing right before, there is a good chance to see that three of our nodes are up. One of the is master.
 Master sends the tasks to the worker nodes, workers are performing the calculations and returning the results to the master.
 
 ![](http://i.imgur.com/vMyXaaT.png)
