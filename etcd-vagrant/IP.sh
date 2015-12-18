#!/bin/bash

IP=$(vagrant ssh -c "ifconfig eth1 | grep 'inet addr:' | grep -Eo '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' | head -1" 2>/dev/null)
IP=$(echo $IP|tr -d '\r')

echo "etcd: http://${IP}:4001"
echo "UI: http://${IP}:8000"