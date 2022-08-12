import WebSocket from 'ws';

function stringToByteArray(s){

    // Otherwise, fall back to 7-bit ASCII only
    var result = new Uint8Array(s.length);
    for (var i=0; i<s.length; i++){
        result[i] = s.charCodeAt(i);/* w ww. ja  v  a 2s . co  m*/
    }
    return result;
}

const ws = new WebSocket('ws://127.0.0.1:24051');

ws.on('open', () => {
    console.log("connected");
    ws.send(stringToByteArray("my data"));

    ws.close();
});

ws.on('message', msg => {
    console.log(msg);
});

