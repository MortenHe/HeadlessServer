//Mit WebsocketServer verbinden
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');

//Rotary laden
var raspi = require('raspi');
var RotaryEncoder = require('raspi-rotary-encoder').RotaryEncoder;

//Pro Drehung kommen immer 2 Werte (z.B. 5 und 6 oder -2 und -3), daher merken welche 2 Werte ein Paar bilden
var valueCounter = 0;
var valueArray = [];

//Wenn Verbindung mit WSS hergestellt wird
ws.on('open', function open() {
    console.log("connected to wss");

    //Rotary anlegen mit passenden PINs
    raspi.init(function () {
        var encoder = new RotaryEncoder({
            pins: { a: "GPIO14", b: "GPIO15" },
            pullResistors: { a: "up", b: "up" }
        });

        //Bei Aenderung des Wertes
        encoder.addListener('change', function (evt) {
            console.log(evt.value);

            //Immer 2 Werte gehoeren zusammen, diese merken
            valueCounter = (valueCounter + 1) % 2;
            valueArray[valueCounter] = evt.value;

            //Wenn der 2. Wert kommt (=Drehung beendet)
            if (valueCounter === 0) {

                //Pruefen in welche Richtung gedreht wurde
                let value = valueArray[1] < valueArray[0] ? true : false;

                //Nachricht an WSS schicken
                ws.send(JSON.stringify({
                    type: "change-volume",
                    value: value
                }));
            }
        });
    });
});