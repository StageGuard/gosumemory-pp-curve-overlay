import WebSocket from 'ws';

function mockOperation1() {
    let beatmapPath = "C:\\Users\\StageGuard\\AppData\\Local\\osu!\\Songs\\458983 Chino (CVMinase Inori) - Mahou Shoujo Chino (nenpulse bootleg remix)\\Chino (CVMinase Inori) - Mahou Shoujo Chino (nenpulse bootleg remix) (Asahina Momoko) [cappuChino!!].osu";
    let encoder = new TextEncoder();
    let pathEncoded = encoder.encode(beatmapPath);
    
    let buffer = Buffer.alloc(pathEncoded.length + 4 + 4 + 1);
    buffer.writeUint8(1, 0);
    buffer.writeUInt32LE(8 | 16, 1);
    buffer.writeUInt32LE(beatmapPath.length, 5);
    buffer.write(beatmapPath, 9);

    return buffer;
}
const ws = new WebSocket('ws://127.0.0.1:24051');

ws.on('open', () => {
    console.log("connected");

    //mock operation 1
    let op1Buffer = mockOperation1();
    ws.send(op1Buffer.buffer);

    ws.close();
});

ws.on('message', buffer => {
    let opCode = buffer.readUInt8(0);
    console.log("handle response, op_code = " + opCode);

    let offset = 1;
    switch (opCode) {
        case 1:
            let sessionMemAddress = buffer.readBigInt64LE(offset); offset += 8;
            let ppCurveLen = buffer.readUInt32LE(offset); offset += 4;
            let ppCurvePoints = [];
            for (let index = 0; index < ppCurveLen; index++) {
                ppCurvePoints.push(buffer.readDoubleLE(offset));
                offset += 8;
            }

            console.log("session mem address: " + sessionMemAddress);
            console.log("ppCurvePoints: " + ppCurvePoints);
        break;
    }

});

