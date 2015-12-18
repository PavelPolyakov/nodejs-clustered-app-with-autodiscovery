#!/bin/bash

echo "0. User and pwd"
echo "user: "$(id)
echo "pwd: "$(pwd)

#first steps
echo "1. Updating and upgrading"
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y language-pack-en-base
echo "
alias IP=\"echo \$(ifconfig eth1 | grep 'inet addr:' | cut -d: -f2 | awk '{ print \$1}')\"" | tee ~/.profile
echo "
LC_ALL=\"en_US.UTF-8\"" | sudo tee /etc/environment
. ~/.profile

# installing the node
echo "2. install node"
curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
sudo apt-get install -y nodejs
cd ~

# npm operations
echo "3. npm install"
cd ~/node-app/
pwd
npm i

