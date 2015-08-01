var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
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

var Downloader = function () {
  var baseDir = '/home/pi/movies';
  var downloadEndedCallback = null;

  function download(url) {
    var command = 'youtube-dl';
    var args = [ '--title', '--continue', url ];

    var options = {
      'cwd': baseDir
    };

    // Store the child process for future use
    var dl = spawn(command, args, options);

    dl.stdout.on('data', function (data) {
      console.log('downloading: ' + data);
    });

    dl.stderr.on('data', function (data) {
      console.log('download error: ' + data);
    });

    dl.on('close', function (code) {
      console.log('download exited with code ' + code);
      if (downloadEndedCallback !== null) {
        downloadEndedCallback(url, code);
      }
    });
  }

  return {
    download: function (url) {
      download(url);
    },

    setDownloadEndedCallback: function (func) {
      downloadEndedCallback = func;
    }
  };
} ();

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
      if (f !== ".DS_Store" &&
          f !== ".AppleDouble" &&
            !f.endsWith(".srt") &&
              !f.endsWith(".part")) {
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
    if (childProcess !== null) {
      response = {
        method: 'error',
        response: 'Movie "' + currentFileName + '" is already playing'
      };
      return response;
    }

    // Then verify that the movie specified actually exists
    var availableMovies = movieList(baseDir);
    if (availableMovies.indexOf(movie) == -1) {
      response = {
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
    response = {
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
    if (childProcess === null) {
      return noMovieResponse();
    }
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
    if (childProcess === null) {
      return noMovieResponse();
    }
    var response = null;
    var c = commands[action];

    // Check if command is valid
    if (c === null) {
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
    if (childProcess === null) {
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
 * Returning a web interface for the application.
 */
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/app/index.html');
});

app.use(express.static(__dirname + '/app'));

/**
 * Definition of the Socket.io endpoints.
 */
io.on('connection', function(socket) {
  Downloader.setDownloadEndedCallback(function (url, code) {
    console.log('download of ' + url + ' ended with code ' + code);
    emitMovies();
    emitDiskSpace();
    emitCurrentMovie();
  });

  var emitMovies = function () {
    console.log('emitting "movies"');
    var response = {
      method: 'movies',
      response: MoviePlayer.movieList()
    };
    socket.emit('movies', response);
  };

  var emitDownload = function (url) {
    console.log('emitting "download"');
    var response = {
      method: 'download',
      response: url
    };
    socket.emit('download', url);
  };

  var emitDiskSpace = function () {
    console.log('emitting "disk"');
    var response = {
      method: 'disk',
      response: getDiskSpace(),
      unit: 'GB'
    };
    socket.emit('disk', response);
  };

  var emitCurrentMovie = function () {
    console.log('emitting "current movie"');
    var response = MoviePlayer.currentMovie();
    socket.emit('current_movie', response);
  };

  var broadcastCurrentMovie = function () {
    console.log('broadcasting "current movie"');
    var response = MoviePlayer.currentMovie();
    socket.broadcast.emit('current_movie', response);
  };

  var broadcastStop = function () {
    socket.broadcast.emit('stop');
  };

  // Upon a new connection, proactively emit the list
  // of movies, the disk space and the current movie playing.
  socket.emit('welcome');
  console.log('client connected');
  emitMovies();
  emitDiskSpace();
  emitCurrentMovie();

  socket.on('movies', function() {
    console.log('received "movies"');
    emitMovies();
  });

  socket.on('disk', function() {
    console.log('received "disk"');
    emitDiskSpace();
  });

  socket.on('current_movie', function () {
    console.log('received "current_movie"');
    emitCurrentMovie();
  });

  socket.on('download', function (url) {
    console.log('received "download ' + url + '"');
    Downloader.download(url);
    emitDownload(url);
  });

  socket.on('play', function (movie) {
    console.log('received "play ' + movie + '"');
    MoviePlayer.play(movie);
    broadcastCurrentMovie();
  });

  socket.on('stop', function (movie) {
    console.log('received "stop"');
    MoviePlayer.stop();
    broadcastStop();
  });

  socket.on('command', function (action) {
    console.log('received "command ' + action + '"');
    MoviePlayer.sendCommand(action);
  });
});

/**
 * Server startup.
 */
http.listen(3000, function(){
  var host = http.address().address;
  var port = http.address().port;

  console.log('Raspberry Pi Movie Player app listening at http://%s:%s', host, port);
});

