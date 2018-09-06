//Mit WebsocketServer verbinden
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');

//GPIO Bibliothek laden
const Gpio = require('onoff').Gpio;

//PreviousPlaylist-Button
const buttonPreviousPlaylist = new Gpio(18, 'in', 'rising', { debounceTimeout: 10 });

//NextPlaylist-Button
const buttonNextPlaylist = new Gpio(23, 'in', 'rising', { debounceTimeout: 10 });

//PreviousTrack-Button
const buttonPreviousTrack = new Gpio(24, 'in', 'rising', { debounceTimeout: 10 });

//NextTrack-Button
const buttonNextTrack = new Gpio(25, 'in', 'rising', { debounceTimeout: 10 });

//SeekMinus-Button
const buttonSeekMinus = new Gpio(23, 'in', 'rising', { debounceTimeout: 10 });

//SeekPlus-Button
const buttonSeekPlus = new Gpio(8, 'in', 'rising', { debounceTimeout: 10 });

//ResetCountdown-Button
const buttonResetCountdown = new Gpio(7, 'in', 'rising', { debounceTimeout: 10 });

//Pause-Button
const buttonPause = new Gpio(12, 'in', 'rising', { debounceTimeout: 10 });

//Wenn Verbindung mit WSS hergestellt wird
ws.on('open', function open() {
    console.log("connected to wss");

    //zur vorherigen Playlist wechseln
    buttonPreviousPlaylist.watch(() => {
        //Play-Befehl (pico file) killen, falls vorhanden
        try {
            execSync("(! pidof play) || sudo kill -9 $(pidof play)");
        }
        catch (e) {
        }

        //Befehl an WSS schicken
        send("change-playlist", -1);
    });

    //zur naechsten Playlist wechseln
    buttonNextPlaylist.watch(() => {
        //Play-Befehl (pico file) killen, falls vorhanden
        try {
            execSync("(! pidof play) || sudo kill -9 $(pidof play)");
        }
        catch (e) {
        }

        //Befehl an WSS schicken
        send("change-playlist", 1);
    });

    //zur vorherigen Track wechseln
    buttonPreviousTrack.watch(() => {
        send("change-track", false);
    });

    //zur naechsten Track wechseln
    buttonNextTrack.watch(() => {
        send("change-track", true);
    });

    //seek -
    buttonSeekMinus.watch(() => {
        send("seek", -10);
    });

    //seek + 
    buttonSeekPlus.watch(() => {
        send("seek", 10);
    });

    //reset countdown
    buttonResetCountdown.watch(() => {
        send("reset-countdown", "");
    });

    //Pause / Unpuase / Playlist wieder von vorne starten
    buttonPause.watch(() => {
        send("toggle-paused-restart", "");
    });
});

//Nachricht an WSS schicken
function send(type, value) {
    console.log(type + ": " + value);

    //Nachricht per JSON schicken
    ws.send(JSON.stringify({
        type: type,
        value: value
    }));
}