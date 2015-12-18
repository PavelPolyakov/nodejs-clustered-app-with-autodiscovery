#!/bin/bash

echo "0. User and pwd"
echo "user: "$(id)
echo "pwd: "$(pwd)

#first steps
echo "1. Updating and upgrading"
sudo apt-get update
sudo apt-get upgrade -y
echo "
alias IP=\"echo \$(ifconfig eth1 | grep 'inet addr:' | cut -d: -f2 | awk '{ print \$1}')\"" | tee ~/.profile
echo "
LC_ALL=\"en_US.UTF-8\"" | sudo tee /etc/environment
. ~/.profile

# install etcd
echo "2. Install etcd"
cd ~
pwd
curl -LsS https://github.com/coreos/etcd/releases/download/v2.2.2/etcd-v2.2.2-linux-amd64.tar.gz -o etcd-v2.2.2-linux-amd64.tar.gz
tar xzvf etcd-v2.2.2-linux-amd64.tar.gz
cd etcd-v2.2.2-linux-amd64

# install etcd
echo "3. Install and configure supervisor"
sudo apt-get install -y supervisor
echo "
[program:etcd]
command=/home/vagrant/etcd-v2.2.2-linux-amd64/etcd --listen-client-urls='http://0.0.0.0:2379,http://0.0.0.0:4001' --advertise-client-urls='http://0.0.0.0:2379,http://0.0.0.0:4001' --debug=true --cors='*'
directory=/home/vagrant/etcd-v2.2.2-linux-amd64/
autostart=true
autorestart=true
stopsignal=KILL
killasgroup=true
stopasgroup=true
stdout_logfile=/var/log/supervisor/%(program_name)s-stdout.log
stderr_logfile=/var/log/supervisor/%(program_name)s-stderr.log
user=vagrant
environment=" | sudo tee -a /etc/supervisor/supervisord.conf

# installing the etcd UI
echo "4. install git and etcd-browser"
sudo apt-get install -y git
curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
sudo apt-get install -y nodejs
cd ~
git clone https://github.com/henszey/etcd-browser.git
echo "
[program:etcd-browser]
command=/bin/bash -c \"ETCD_HOST=\$(ifconfig eth1 | grep 'inet addr:' | cut -d: -f2 | awk '{ print \$1}') exec node server.js\"
directory=/home/vagrant/etcd-browser/
autostart=true
autorestart=true
stopsignal=KILL
killasgroup=true
stopasgroup=true
stdout_logfile=/var/log/supervisor/%(program_name)s-stdout.log
stderr_logfile=/var/log/supervisor/%(program_name)s-stderr.log
user=vagrant
environment=" | sudo tee -a /etc/supervisor/supervisord.conf

# reload supervisord
sudo supervisorctl reload