#!/bin/bash
cd /home/pi/mh_prog/HeadlessServer
/usr/bin/sudo /usr/bin/node ./server.js > /home/pi/mh_prog/output-server.txt &

/bin/sleep 5
/usr/bin/sudo /usr/bin/node ./button.js > /home/pi/mh_prog/output-button.txt &
/usr/bin/sudo /usr/bin/node ./rotary.js > /home/pi/mh_prog/output-rotary.txt &