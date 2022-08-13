import WebSocket from 'ws';

function mockOp1() {
    let beatmapPath = "C:\\Users\\StageGuard\\AppData\\Local\\osu!\\Songs\\458983 Chino (CVMinase Inori) - Mahou Shoujo Chino (nenpulse bootleg remix)\\Chino (CVMinase Inori) - Mahou Shoujo Chino (nenpulse bootleg remix) (Asahina Momoko) [cappuChino!!].osu";
    let encoder = new TextEncoder();
    let pathEncoded = encoder.encode(beatmapPath);
    
    let buffer = Buffer.alloc(pathEncoded.length + 4 + 4 + 1);
    let offset = 0;

    buffer.writeUint8(0x1, offset); offset += 1;
    buffer.writeUInt32LE(1, offset); offset += 4;
    buffer.writeUInt32LE(beatmapPath.length, offset); offset += 4;
    buffer.write(beatmapPath, offset);

    return buffer;
}

function mockOp2(sessionMemAddr) {
    let comboList = [442, 180];

    let buffer = Buffer.alloc(1 + 8 + 8 + 8 * comboList.length);
    let offset = 0;

    buffer.writeUint8(0x2, offset); offset += 1;
    buffer.writeBigUInt64LE(sessionMemAddr, offset); offset += 8;
    buffer.writeBigUint64LE(BigInt(comboList.length), offset); offset += 8;

    for (const i in comboList) {
        buffer.writeBigUint64LE(BigInt(comboList[i]), offset); offset += 8;
    }

    return buffer;
}

function mockOp3(sessionMemAddr, passedObjects) {
    let buffer = Buffer.alloc(1 + 8 + 8);
    let offset = 0;

    buffer.writeUint8(0x3, offset); offset += 1;
    buffer.writeBigUInt64LE(sessionMemAddr, offset); offset += 8;
    buffer.writeBigUint64LE(BigInt(passedObjects), offset); offset += 8;

    return buffer;
}

function mockOp4(sessionMemAddr) {
    let buffer = Buffer.alloc(1 + 8);
    let offset = 0;

    buffer.writeUint8(0x4, offset); offset += 1;
    buffer.writeBigUInt64LE(sessionMemAddr, offset); offset += 8;

    return buffer;
}

const ws = new WebSocket('ws://127.0.0.1:24051');

ws.on('open', () => {
    console.log("connected");

    //mock operation 1
    let op1Buffer = mockOp1();
    ws.send(op1Buffer.buffer);
});

ws.on('message', buffer => {
    let opCode = buffer.readUInt8(0);
    console.log("handle response, op_code = " + opCode);

    let offset = 1;
    if(opCode == 1) {
        let sessionMemAddress = buffer.readBigInt64LE(offset); offset += 8;
        let ppCurveLen = buffer.readBigUint64LE(offset); offset += 8;
        let ppCurvePoints = [];
        for (let index = 0; index < ppCurveLen; index++) {
            ppCurvePoints.push(buffer.readDoubleLE(offset));
            offset += 8;
        }

        console.log("session mem address: " + sessionMemAddress);
        console.log("pp curve points: " + ppCurvePoints);

        for (let index = 0; index < 100; index++) {
            // mock op2
            let op2Buffer = mockOp2(sessionMemAddress);
            ws.send(op2Buffer.buffer);
        }

        for(let index = 0; index < 1500; index += 10) {
            let op3Buffer = mockOp3(sessionMemAddress, index);
            ws.send(op3Buffer.buffer);
        }

        let op4Buffer = mockOp4(sessionMemAddress)
        ws.send(op4Buffer);
    } else if(opCode == 2) {
        let ppCurveLen = buffer.readBigUint64LE(offset); offset += 8;
        let ppCurvePoints = [];
        for (let index = 0; index < ppCurveLen; index++) {
            ppCurvePoints.push(buffer.readDoubleLE(offset));
            offset += 8;
        }
        console.log("pp curve points: " + ppCurvePoints);
    } else if(opCode == 3) {
        let passedObjects = buffer.readBigUInt64LE(offset); offset += 8;
        let stars = buffer.readDoubleLE(offset); offset += 8;
        console.log("current passed objects: " + passedObjects + ", stars: " + stars);
    } else if(opCode == 4) {
        let releaseSessionMemAddr = buffer.readBigInt64LE(offset); offset += 8;
        console.log("session at " + releaseSessionMemAddr + " is released.");
    }

});

