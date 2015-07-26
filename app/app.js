// Main namespace object of this application
var MoviePlayer = function () {
    var socket = io();

    var init = function () {
      socket.on('movies', function (moviesObj) {
          console.log('received "movies"');
          var movies = moviesObj["response"];
            var createTapHandler = function(movie) {
                return function (event, data) {
                    MoviePlayer.playMovie(movie);
                };
            };
            var list = $('#movieList');
            list.empty();
            for (var index = 0, length = movies.length; index < length; ++index) {
                var movie = movies[index];
        
                var playLink = $('<a>');
                playLink.attr('href', '#detail');
                playLink.attr('data-transition', 'slide');
                playLink.bind('tap', createTapHandler(movie));
                playLink.append(movie);
        
                var newLi = $('<li>');
                newLi.append(playLink);
                list.append(newLi);
            }
            list.listview('refresh');
      });
      
      socket.on('disk', function (diskObj) {
          console.log('received "disk"');
          var disk = diskObj["response"];
          $('#diskSpaceLabel').html('Available disk space: ' + disk);
            $('#diskSpaceLabelAgain').html('Available disk space: ' + disk);
      });
      
      socket.on('current_movie', function (currentMovieObj) {
          console.log('received "current_movie"');
          var method = currentMovieObj["method"];
            if (method === 'error') {
                $.mobile.navigate('#main');
            }
            else {
                var movieName = currentMovieObj['response'];
                $('#movieName').html(movieName);
                    $.mobile.navigate('#detail');
            }
      });
      
        socket.on('stop', function () {
            console.log('received "stop"');
            $.mobile.navigate('#main');
        });
    };

    // Public interface
    return {
        init: function () {
            init();
        },
        
        playMovie: function (movieName) {
            console.log('emitting "play ' + movieName + '"');
            socket.emit('play', movieName);
        },

        sendCommand: function (command) {
            console.log('emitting "command ' + command + '"');
            socket.emit('command', command);
        },

        getMovieList: function () {
            console.log('emitting "movies"');
            socket.emit('movies');
        },

        getCurrentMovie: function () {
            console.log('emitting "current_movie"');
            socket.emit('current_movie');
        },

        getAvailableDiskSpace: function () {
            console.log('emitting "disk"');
            socket.emit('disk');
        },
        
        stopMovie: function () {
            console.log('emitting "stop"');
            socket.emit('stop');
        }
    };
} ();

$(document).on('pageinit', '#main', function() {
    MoviePlayer.init();
});

$(document).on('pageinit', '#detail', function () {
    var commands = ['pause', 'volup', 'voldown', 'backward', 'forward',
                    'backward10', 'forward10', 'slower', 'faster', 'info', 'subtitles'];
    var createCommandHandler = function(command) {
        return function (event) {
            MoviePlayer.sendCommand(command);
        };
    };

    for (var index = 0, len = commands.length; index < len; ++index) {
        var item = commands[index];
        $('#' + item + 'Button').click(createCommandHandler(item));
    }
});

$(document).on('pageinit', '#confirm', function () {
    $('#stopButton').click(function (event) {
        MoviePlayer.stopMovie();
        $.mobile.navigate('#main');
    });
    $('#cancelStopButton').click(function (event) {
        $.mobile.navigate('#detail');
    });
});

$(document).on('pagebeforeshow', '#main', function() {
    // We check to see whether a movie is playing. This is
    // required since the application might be closed by the user,
    // and when relaunched, we want to display the controls for the
    // movie instead of the movie list.
    setTimeout(function () {
        MoviePlayer.getCurrentMovie();
    }, 500);
});

$(document).on('pagebeforeshow', '#detail', function() {
    // We check to see whether a movie is playing. This is
    // required since the application might be closed by the user,
    // and when relaunched, we want to display the controls for the
    // movie instead of the movie list.
    setTimeout(function () {
        MoviePlayer.getCurrentMovie();
    }, 500);
});
