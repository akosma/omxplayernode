# omxplayernode

[Node.js][nodejs] + [Express][express] + [socket.io][socketio] interface for
[omxplayer][omxplayer] on a [Raspberry Pi][raspi].

This project replaces completely [omxplayerphp][omxplayerphp].

## Requirements

This project requires Node.js 0.10.40 or greater on your Raspberry Pi. The
current versions of Raspbian install only version 0.6, so you need to [follow
the instructions in this page][install] to get version 0.10 up and running.

For your convenience, install also [supervisor][supervisor].

## Installation

To install this code in your Raspberry Pi:

1. Clone the project.
2. Run `npm install` on the command line.
3. Copy your movie files (including subtitle files) in the `/home/pi/movies`
   folder.
4. Run the command `supervisor server.js` on the command line.
5. Browse to `http://[YOUR_RASPI_IP_HERE]:3000` to use the application.

To be able to interact with the server, consider installing
[omxplayerios][omxplayerios] on your iOS devices.

## Protocol

The application has a very simple protocol:

- Whenever a new client connects, it gets the list of movies, the available
  disk space and the name of the current movie automatically. The respective
  messages are `movies`, `disk` and `current_movie.`
- All messages have the same format: `{ method: 'method_name', response:
  [array]|string }`
- Response messages include the name of the api method in the `method` field.
- The `movies` message returns a list of filenames.
- The `disk` message returns a string with the number and unit, like "14G"
  meaning 14 gigabytes.
- The `current_movie` message returns a string with the filename of the movie
  currently playing.
- The `play` message triggers a broadcast to all connected clients of the
  `current_movie` message.
- The `stop` message triggers a broadcast to all connected clients of the
  `stop` message.
- The `command` message does not trigger a broadcast nor returns anything.

## License

Check the LICENSE file for details.


[express]:http://expressjs.com
[install]:http://joshondesign.com/2013/10/23/noderpi
[nodejs]:https://nodejs.org
[omxplayer]:http://www.raspberry-projects.com/pi/software_utilities/omxplayer
[omxplayerios]:https://github.com/akosma/omxplayerios
[omxplayerphp]:https://github.com/akosma/omxplayerphp
[raspi]:https://www.raspberrypi.org
[socketio]:http://socket.io
[supervisor]:https://www.npmjs.com/package/supervisor

