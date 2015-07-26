var express = require('express');
var app = require('express')();
var http = require('http');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var execSync = require("exec-sync");
var fs = require('fs');

/**
 * Returns a boolean stating whether the current string
 * has the specified suffix.
 * Courtesy of
 * http://stackoverflow.com/a/2548133/133764
 */
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

/**
 * Returns the currently available disk space in this
 * Raspberry Pi unit.
 * Unfortunately we cannot use child_process.execSync
 * as it is only available on Node 0.12 onwards,
 * and we're using 0.10 here.
 */
var getDiskSpace = function () {
    return execSync("df -h | grep /dev/root | awk '{print $4}'");
};

/**
 * Singleton object wrapping the complete interaction with the 
 * child process playing the movie.
 */
var MoviePlayer = function () {
    /**
     * When a movie is playing, this variable
     * holds the filename of the movie.
     */
    var currentFileName = null;

    /**
     * Variable holding the spawned omxplayer process.
     */
    var childProcess = null;

    /**
     * Location of the movies
     */
    var baseDir = '/home/pi/movies';

    /**
     * Dictionary holding the valid commands that can be
     * passed through the "send command" API endpoint.
     * The keys are the values that should be sent from 
     * the clients, while the values are the actual commands
     * that omxplayer expects.
     */
    var commands = {
        "pause":      " ",
        "forward":    "$'\e'[C",
        "backward":   "$'\e'[D",
        "forward10":  "$'\e'[A",
        "backward10": "$'\e'[B",
        "info":       "z",
        "faster":     "2",
        "slower":     "1",
        "volup":      "+",
        "voldown":    "-",
        "subtitles":  "s"
    };

    /**
     * Returns a string with the list of all the 
     * commands accespted by this object through the
     * "send command API endpoint, for convenience.
     */
    var validCommands = function () {
        var output = [];
        for (var key in commands) {
            output.push(key);
            output.sort();
        }
        var result = output.join(", ");
        return result;
    };

    /**
     * Returns the complete list of files, without
     * the *.srt files in the specified folder.
     */
    var movieList = function (path) {
        var movies = [];
        var d = fs.readdirSync(path);
        for (var i = 0, len = d.length; i < len; ++i) {
            var f = d[i];
            if (f !== ".DS_Store" && !f.endsWith(".srt")) {
                movies.push(f);
            }
        }
        movies.sort();
        return movies;
    };

    /**
     * Plays the movie passed as parameter.
     * If a movie is already playing, the client receives a special
     * error message telling him so.
     * If the movie passed as parameter is not a valid filename,
     * the client receives an error message.
     * If the filename is valid, and no other movie was playing, then
     * a child omxplayer process launches and is kept for interaction.
     */
    var play = function (movie) {
        var response = null;

        // First verify that there isn't a movie already playing
        if (childProcess != null) {
            response = {
                method: 'error',
                response: 'Movie "' + currentFileName + '" is already playing'
            };
            return response;
        }

        // Then verify that the movie specified actually exists
        var availableMovies = movieList(baseDir);
        if (availableMovies.indexOf(movie) == -1) {
            var response = {
                method: 'error',
                response: 'Please specify a valid movie file'
            };
            return response;
        }

        // All is well, let's play!
        currentFileName = movie;
        var command = 'omxplayer';
        var args = ['-o', 'hdmi', baseDir + '/' + movie];

        var options = {
            'stdio': ['pipe', 'pipe', process.stderr],
            'cwd': baseDir
        };

        // Store the child process for future use
        childProcess = spawn(command, args, options);
        var response = {
            method: 'play',
            response: movie
        };
        return response;
    };

    /**
     * Stops the current movie and kills the omxplayer process.
     * It resets the status of this MoviePlayer object to a
     * default state.
     * If no child process is available, the standard "no
     * movie" response is sent.
     */
    var stop = function () {
        if (childProcess == null) {
            return noMovieResponse();
        }
        var response = null;
        var command = 'killall /usr/bin/omxplayer.bin';
        exec(command);
        childProcess.kill();
        childProcess = null;
        currentFileName = null;
        var response = {
            method: 'stop',
            response: 'Movie stopped'
        };
        return response;
    };

    /**
     * Standard response sent by many functions
     * in this object whenever a method is called and
     * no movie is playing.
     */
    var noMovieResponse = function () {
        response = {
            method: "error",
            response: "No movie is playing"
        };
        return response;
    };

    /**
     * Pipes a command into the stdin interface of the
     * current omxplayer child process.
     * If no child process is available, this function
     * returns the standard "no movie" response.
     * If the command passed as parameter is not one
     * of the valid commands, an explanatory text is sent
     * to the client with the list of proper commands.
     */
    var sendCommand = function (action) {
        if (childProcess == null) {
            return noMovieResponse();
        }
        var response = null;
        var c = commands[action];

        // Check if command is valid
        if (c == null) {
            var v = validCommands();
            response = {
                method: "error",
                response: "Invalid command; try any of these: " + v
            };
            return response;
        }
        
        // Command is valid, send it to the child process
        childProcess.stdin.write(c);
        response = {
            method: 'command',
            action: action
        };
        return response;
    };

    /**
     * Returns the filename of the movie currently playing.
     * If no movie is playing, then the standard
     * "no movie" response is sent.
     */
    var currentMovie = function () {
        if (childProcess == null) {
            return noMovieResponse();
        }
        var response = {
            method: 'current_movie',
            response: currentFileName
        };
        return response;
    };

    /**
     * Public interface of this object.
     */
    return {
        play: function (movie) {
            return play(movie);
        },

        stop: function () {
            return stop();
        },

        currentMovie: function () {
            return currentMovie();
        },

        version: function () {
            return "Raspberry Pi Movie Player API 2.0";
        },

        movieList: function () {
            return movieList(baseDir);
        },

        sendCommand: function (action) {
            return sendCommand(action);
        }
    };
} ();

/**
 * Definition of the API endpoints.
 */
var app = express();

app.get('/', function (req, res) {
    var response = {
        method: 'version',
        response: MoviePlayer.version()
    };
    res.send(response);
});

app.get('/disk', function (req, res) {
    var response = {
        method: 'disk',
        response: getDiskSpace(),
        unit: 'GB'
    };
    res.send(response);
});

app.get('/movies', function (req, res) {
    var response = {
        method: 'movies',
        response: MoviePlayer.movieList()
    };
    res.send(response);
});

app.get('/current_movie', function (req, res) {
    var response = MoviePlayer.currentMovie();
    res.send(response);
});

app.post('/play/:movie', function (req, res) {
    var movie = req.params.movie;
    var response = MoviePlayer.play(movie);
    res.send(response);
});

app.post('/stop', function (req, res) {
    var response  = MoviePlayer.stop();
    res.send(response);
});

app.post('/command/:action', function (req, res) {
    var action = req.params.action;
    var response = MoviePlayer.sendCommand(action);
    res.send(response);
});

var server = http.Server(app)

server.listen(3000, function(){
    var host = server.address().address;
    var port = server.address().port;

    console.log('Raspberry Pi Movie Player app listening at http://%s:%s', host, port);
});
