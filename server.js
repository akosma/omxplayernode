var express = require('express');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var execSync = require("exec-sync");
var fs = require('fs');

var app = express();

String.prototype.endsWith = function(suffix) {
    // http://stackoverflow.com/a/2548133/133764
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var getDiskSpace = function () {
    // Unfortunately we cannot use child_process.execSync 
    // as it is only available on Node 0.12 onwards, and
    // we're using 0.10 here.
    return execSync("df -h | grep /dev/root | awk '{print $4}'");
};

var MoviePlayer = function () {
    var currentFileName = null;
    var childProcess = null;
    var baseDir = '/home/pi/movies';

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

    var validCommands = function () {
        var output = [];
        for (var key in commands) {
            output.push(key);
            output.sort();
        }
        var result = output.join(", ");
        return result;
    };

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

    var noMovieResponse = function () {
        response = {
            method: "error",
            response: "No movie is playing"
        };
        return response;
    };

    var sendCommand = function (action) {
        if (childProcess == null) {
            return noMovieResponse();
        }
        var response = null;
        var c = commands[action];
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

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Raspberry Pi Movie Player app listening at http://%s:%s', host, port);
});

