//Mplayer + Wrapper anlegen
const createPlayer = require('mplayer-wrapper');
const player = createPlayer();

//WebSocketServer anlegen und starten
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, clientTracking: true });

//Filesystem und Path Abfragen fuer Playlist
const path = require('path');
const fs = require('fs-extra');

//Array Shuffle Funktion
var shuffle = require('shuffle-array');

//Farbiges Logging
const colors = require('colors');

//Befehle auf Kommandzeile ausfuehren
const { execSync } = require('child_process');

//Verzeichnisse
const mainDir = "/media/headless";
const audioDir = mainDir + "/audio";
console.log("audio files dir:\n" + audioDir.cyan);

//System-Lautstaerke zu Beginn auf 100% setzen
setSystemVolume(100);

//Countdownzeit (in Sek.)
const countdownTime = 600;
var currentCountdownTime = countdownTime;

//Countdown starten (jede Sekunde runterzaehlen)
setInterval(countdown, 1000);

//Aktuelle Infos zu Playback 
currentVolume = 50;
currentPosition = 0;
currentFiles = [];
currentPlaylist = "";
currentPlaylistIndex = 0;
currentTime = 0;

//Liste der Playlists
playlistArray = [];

//txt-Datei der Titel der aktuellen Playlist
playlistFile = null;

//Player zu Beginn auf 50% volume stellen
player.setVolume(currentVolume);

//Wenn Playlist fertig ist
player.on('playlist-finish', () => {
    console.log("playlist finished");

    //Position und Zeit zuruecksetzen
    currentPosition = -1;
    currentTime = 0;

    //Info in JSON schreiben, dass Playlist vorbei ist
    writePlaylistJson();
});

//Wenn sich der Pausezustand aendert
player.on('pause', (paused) => {
    console.log("paused: " + paused);

    //Wenn nicht mehr pausiert ist
    if (!paused) {

        //10 sek zurueck springenq
        player.seek(-10);
    }
});

//Wenn aktuelle Dateinamen (inkl. Pfad) geliefert wird
player.on("path", (path) => {

    //Position in Playlist ermitteln
    currentPosition = currentFiles.indexOf(path);
    console.log("play track " + currentPosition.toString().yellow + "\n" + path.cyan);
})

//Wenn sich ein Titel aendert (durch Nutzer oder durch den Player)
player.on('track-change', () => {

    //Neuen Dateinamen liefern (inkl. Pfad)
    player.getProps(["path"]);
});

//Rekursiv ueber Verzeichnisse gehen
var walk = (dir) => {

    //Ergebnisse sammeln
    var results = [];

    //Dateien in Verzeichnis auflisten
    var list = fs.readdirSync(dir);

    //Ueber Dateien iterieren
    list.forEach((file) => {

        //Infos ueber Datei holen
        file = path.resolve(dir, file);
        var stat = fs.statSync(file);

        //Wenn es ein Verzeichnis ist
        if (stat && stat.isDirectory()) {

            //Unterverzeichnis aufrufen
            results = results.concat(walk(file));
        }

        //es ist eine Datei
        else {

            //nur mp3-Dateien sammeln
            if (path.extname(file).toLowerCase() === '.mp3') {
                results.push(file);
            }
        }
    });

    //Liste zurueckgeben
    return results;
}

//Liste der Playlists ermitteln
let list = fs.readdirSync(audioDir);

//Ueber Elemente auf oberster Ebene gehen
list.forEach((file) => {

    //Infos ueber Datei holen
    file = path.resolve(audioDir, file);
    let stat = fs.statSync(file);

    //Wenn es ein Verzeichnis ist
    if (stat && stat.isDirectory()) {
        playlistArray.push(file);
    }

    //es ist eine Datei
    else {

        //nur mp3-Dateien sammeln
        if (path.extname(file).toLowerCase() === '.mp3') {
            playlistArray.push(file);
        }
    }
});
console.log("available playlists:\n" + (playlistArray.join('\n')).green);

//Liste der Session Files ermitteln
let sessionFiles = fs.readdirSync(mainDir);

//Ueber Session Files (json, pico) gehen
sessionFiles.forEach((file) => {

    //Infos ueber Datei holen
    filePath = path.resolve(mainDir, file);
    let stat = fs.statSync(filePath);

    //Wenn es eine Datei ist, aber nicht die _lastSession Datei
    if (stat && stat.isFile() && file !== "_lastSession.json") {

        //Datei-Endung (.json oder .wav) entfernen
        fileWithoutExt = file.replace(/\.[^/.]+$/, "");

        //wenn es keine passende Playlist zu dieser Datei gibt
        if (!fs.existsSync(audioDir + "/" + fileWithoutExt)) {
            console.log("playlist " + fileWithoutExt.red + " does not exist");
            console.log("clean session file " + filePath.red);

            //Session-Datei loeschen
            fs.removeSync(filePath);
        }
    }
});

//Letzte Playlist laden, falls es Infos gibt
if (fs.existsSync(mainDir + '/_lastSession.json')) {

    //JSON-Objekt aus Datei holen
    const lastSessionObj = fs.readJsonSync(mainDir + '/_lastSession.json');

    //Playlist-Pfad laden
    currentPlaylistIndex = playlistArray.indexOf(lastSessionObj.currentPlaylist);
    console.log("last playlist:\n" + (lastSessionObj.currentPlaylist).magenta);
    console.log("playlist index:\n" + (currentPlaylistIndex).toString().red);

    if (currentPlaylistIndex === -1) {
        console.log("couldn't find last playlist".red);
        currentPlaylistIndex = 0;
    }
}

//Player starten
setPlaylist();

//Playlist erstellen und starten
function setPlaylist() {

    //Playlist ermitteln
    currentPlaylist = playlistArray[currentPlaylistIndex];
    console.log("start playlist\n" + currentPlaylist.blue);

    //Sicherstellen, dass Verzeichnis existiert, aus dem die Dateien geladen werden sollen
    if (fs.existsSync(currentPlaylist)) {

        //Playlist in JSON Session speichern (fuer Restart)
        writeSessionJson();

        //Jede Playlist hat ihre eigene Datei mit dem Ablauf der Files
        playlistFile = mainDir + "/" + path.basename(currentPlaylist) + ".txt"

        //Wenn es zu dieser Playlist noch kein File gibt
        if (!fs.existsSync(playlistFile)) {
            console.log("no playlist file for:\n" + currentPlaylist.red);

            //Infos ueber Datei / Dir holen
            let file = path.resolve(audioDir, currentPlaylist);
            var stat = fs.statSync(file);

            //Wenn es ein Verzeichnis ist
            if (stat && stat.isDirectory()) {

                //alle mp3-Dateien in diesem Dir-Tree ermitteln
                currentFiles = walk(currentPlaylist);
            }

            //es ist eine Datei
            else {

                //Liste der Dateien ist die einzelne Datei selbst
                currentFiles = [currentPlaylist];
            }

            //Wenn die Playlist mit (random) benannt ist
            if (currentPlaylist.indexOf("(random)")) {
                console.log("random playlist".blue);

                //Dateien als Random
                shuffle(currentFiles);
            }

            //Playlist File erstellen
            fs.writeFileSync(playlistFile, currentFiles.join("\n"));
        }

        //es gibt schon ein Playlist file
        else {
            console.log("use existing playlist file for:\n" + currentPlaylist.green);

            //Playlistdatei auslesen und in currentFiles schreiben
            let files = fs.readFileSync(playlistFile, 'utf8');
            currentFiles = files.split('\n');
        }

        //Playlist-Datei schreiben (1 Zeile pro item)
        console.log("current files:\n" + currentFiles.join("\n").yellow);

        //Namen der aktuellen Playlist vorlesen
        readPlaylist();

        //Playlist-Datei laden und starten
        player.exec("loadlist '" + playlistFile + "'");

        //Fortschritt in Playlist aus Datei lesen
        let progressFile = mainDir + "/" + path.basename(currentPlaylist) + ".json"

        //Wenn diese Playlist schon mal abgespielt wurde und sich an einer bestimmten Stelle befindet
        if (fs.existsSync(progressFile)) {
            console.log("load playlist progress from:\n" + progressFile.blue);

            //JSON-Objekt aus Datei holen
            const playlistObj = fs.readJsonSync(progressFile);

            //Playlist-Pfad laden
            currentPosition = playlistObj.position;
            console.log("playlist position:\n" + (currentPosition).toString().magenta);

            currentTime = playlistObj.time;
            console.log("playlist time:\n" + (currentTime).toString().magenta);
        }

        //diese Playlist wird zum 1. Mal gestartet
        else {
            console.log("no progress info available".red);

            //Playback bei 1. Titel von vorne beginnen
            currentPosition = 0;
            currentTime = 0;
        }

        //zu gewissem Titel springen, wenn nicht sowieso der erste Titel
        if (currentPosition > 0) {
            player.exec("pt_step " + currentPosition);
        }

        //zu gewisser Zeit springen, wenn wir nicht am Anfang sind
        if (currentTime > 0) {
            player.seek(currentTime);
        }
    }

    //Verzeichnis existiert nicht
    else {
        console.log("dir doesn't exist " + currentPlaylist.red);

        //1. Playlist laden und starten
        currentPlaylistIndex = 0;
        setPlaylist();
    }
}

//Letzte Playlist (Datei oder Ordner) merken (fuer Restart)
function writeSessionJson() {
    fs.writeJsonSync(mainDir + '/_lastSession.json', { currentPlaylist: currentPlaylist });
}

//Infos der aktuellen Playlist in File schreiben
function writePlaylistJson() {

    //media/headless/audio/Schnuddel -> Schnuddel
    let filename = path.basename(currentPlaylist);

    //Position in Playlist und innerhalb des Titels merken
    fs.writeJsonSync(mainDir + '/' + filename + '.json',
        {
            position: currentPosition,
            time: currentTime
        });
}

//Wenn time_pos property geliefert wird
player.on('time_pos', (totalSecondsFloat) => {

    //Float zu int: 13.4323 => 13
    currentTime = Math.trunc(totalSecondsFloat);

    if (currentTime % 5 === 0) {
        console.log('track progress is', currentTime);
    }

    //Infos zu aktueller Datei in JSON schreiben
    writePlaylistJson();
});

//Jede Sekunde die aktuelle Zeit innerhalb des Tracks liefern
setInterval(() => {
    player.getProps(['time_pos']);
}, 1000);

//Countdown mit Shutdown
function countdown() {

    //Countdown runterzaehlen
    currentCountdownTime--;

    //Regelmaesige Ausgaben ueber Countdown
    if (currentCountdownTime % 10 === 0) {
        console.log(currentCountdownTime + " seconds left");
    }

    //Fade Out kurz vor Ende des Countdowns
    if (currentCountdownTime < 40 && currentCountdownTime >= 20) {

        //Volume schrittweise verringern
        let volume = (currentCountdownTime - 20) * 5;
        setSystemVolume(volume);
    }

    //Anzahl der Sekunden bis Shutdown anzeigen 
    if (currentCountdownTime < 20) {
        console.log("shutdown in " + currentCountdownTime.toString().red)
    }

    //Countdown abgelaufen
    if (currentCountdownTime === 0) {
        console.log("shutdown".red);

        //TODO: System herunterfahren
        process.exit();
    }
}

//Systemlautstaerke setzen
function setSystemVolume(volume) {

    //Systemlautstaerke ist unabhaengig von Playerlautstaerke -> fuer Fadeout beim Countdown geeignet
    let volumeCommand = "sudo amixer sset PCM " + volume + "% -M";
    console.log(volumeCommand.yellow)
    execSync(volumeCommand);
}

//Name der Playlist vorlesen
function readPlaylist() {

    //Aktuelle Playlist stoppen, damit Ansagen nicht ueberlagert wird
    player.stop();

    //Name der Playlist ermitteln
    let playlistName = path.basename(currentPlaylist);

    //Pico-Dateinamen ermitteln
    picoFile = mainDir + "/" + playlistName + ".wav";

    //Wenn noch kein Pico File existiert
    if (!fs.existsSync(picoFile)) {
        console.log("create pico file".red);

        //Dateiendung .mp3 bei Einzelfiles nicht vorlesen
        let playlistText = playlistName.replace('.mp3', '');

        //random Info nicht vorlesen
        playlistText = playlistText.replace('(random)', '');

        //Pico File erstellen
        execSync('pico2wave --lang de-DE --wave "' + picoFile + '" "' + playlistText + '"');
    }

    //es gibt bereits ein Pico File
    else {
        console.log("pico file exists".green);
    }

    //Pico File abspielen (Befehl kann von aus gekillt werden)
    try {
        execSync("play '" + picoFile + "' 2>&1");
    }
    catch (e) {
        //nichts tun, wenn Befehl von aussen gekillt wird
    }
}

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WS eine Nachricht an WSS sendet
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Playlist wurde von Nutzer weitergeschaltet
            case 'change-playlist':
                console.log("change-playlist " + value);

                //Wenn die vorherige Playlist kommen soll und wir bereits bei Index 0 sind
                if (value === -1 && currentPlaylistIndex === 0) {

                    //Zum letzten Index in der Liste springen
                    currentPlaylistIndex = playlistArray.length - 1;
                }

                //Wenn zu naechsten Playlist geschaltet werden soll, aber zur vorherigen Playlist und wir nicht bei Index 0 sind
                else {

                    //Neuen Playlistindex berechnen
                    currentPlaylistIndex = (currentPlaylistIndex + value) % playlistArray.length
                }
                console.log("new playlist index:\n" + currentPlaylistIndex.toString().green)

                //Playlist starten
                setPlaylist();
                break;

            //Song wurde vom Nutzer weitergeschaltet
            case 'change-track':
                console.log("change-item " + value);

                //wenn der naechste Song kommen soll
                if (value) {

                    //Wenn wir noch nicht beim letzten Titel sind
                    if (currentPosition < (currentFiles.length - 1)) {

                        //zum naechsten Titel springen
                        player.next();
                    }

                    //wir sind beim letzten Titel
                    else {
                        console.log("kein next beim letzten Track");
                    }
                }

                //der vorherige Titel soll kommen
                else {

                    //Wenn wir nicht beim 1. Titel sind
                    if (currentPosition > 0) {

                        //zum vorherigen Titel springen
                        player.previous();
                    }

                    //wir sind beim 1. Titel
                    else {
                        console.log("1. Titel von vorne");

                        //Playlist nochmal von vorne starten
                        player.seekPercent(0);
                    }
                }
                break;

            //Innerhalb des Titels spulen
            case "seek":
                player.seek(value);
                break;

            //Pause-Status toggeln
            case 'toggle-paused-restart':

                //Wenn wir gerade in der Playlist sind
                if (currentPosition !== -1) {

                    //Pause toggeln
                    player.playPause();

                    //Pausenzustand ermitteln
                    player.getProps(['pause']);
                }

                //Playlist ist schon vorbei
                else {

                    //wieder von vorne beginnen
                    currentPosition = 0;

                    //Playlist-Datei laden und starten
                    player.exec("loadlist '" + playlistFile + "'");
                }
                break;

            //Lautstaerke aendern
            case 'change-volume':

                //Wenn es lauter werden soll, max. 100 setzen
                if (value) {
                    currentVolume = Math.min(100, currentVolume + 10);
                }

                //es soll leiser werden, min. 0 setzen
                else {
                    currentVolume = Math.max(0, currentVolume - 10);
                }

                //Lautstaerke setzen
                console.log("change volume to " + currentVolume);
                player.setVolume(currentVolume);
                break;

            //Countdown zuruecksetzen
            case "reset-countdown":
                console.log("reset countdown".green);

                //Countdownzeit zuruecksetzen
                currentCountdownTime = countdownTime;

                //System-Volume wieder auf 100%
                setSystemVolume(100);
                break;
        }
    });
});