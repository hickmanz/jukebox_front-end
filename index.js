const express = require('express');

const app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use('/', express.static('public'))
app.use('/dev', express.static('dev'))
app.use('/player', express.static('player'))

//app.get('/', (req, res) => {
//  res.status(200).send('Hello, world!').end();
//});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
