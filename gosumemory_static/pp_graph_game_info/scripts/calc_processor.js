this.CalcProcessor = (function () {
    const textEncoder = new TextEncoder();

    return {
        // session
        createCalcSession(path, mods) {
            let pathArr = textEncoder.encode(path);
            let buffer = new ArrayBuffer(1 + 4 + 4 + pathArr.length);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x0); offset += 1;
            view.setUint32(offset, mods, true); offset += 4;
            view.setUint32(offset, pathArr.length, true); offset += 4;

            let u8Arr = new Uint8Array(buffer);
            u8Arr.set(pathArr, offset);

            return u8Arr;
        },
        releaseCalcSession(sessionMemAddr) {
            let buffer = new ArrayBuffer(1 + 8);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x1); offset += 1;
            view.setBigInt64(offset, sessionMemAddr, true); offset += 8;

            return new Uint8Array(buffer);
        },
        parseCalcSessionPacket(view) {
            let offset = 1;
            let sessionMemAddr = view.getBigInt64(offset, true); offset += 8;
            return { sessionMemAddr }

        },

        // pp curve
        calculateMaxComboPPCurve(sessionMemAddr) {
            let buffer = new ArrayBuffer(1 + 8);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x2); offset += 1;
            view.setBigInt64(offset, sessionMemAddr, true); offset += 8;

            return new Uint8Array(buffer);
        },
        calculateCurrentPPCurve(sessionMemAddr, comboList, misses) {
            let buffer = new ArrayBuffer(1 + 8 + 8 + 8 + 8 * comboList.length);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x3); offset += 1;
            view.setBigInt64(offset, sessionMemAddr, true); offset += 8;
            view.setBigUint64(offset, BigInt(misses), true); offset += 8;
            view.setBigUint64(offset, BigInt(comboList.length), true); offset += 8;

            for (const i in comboList) {
                view.setBigUint64(offset, BigInt(comboList[i]), true); offset += 8;
            }

            return new Uint8Array(buffer);
        },

        parsePPCurvePacket(view) {
            let offset = 1;
            let ppCurveLen = view.getBigUint64(offset, true); offset += 8;
            let ppCurvePoints = [];
            for (let index = 0; index < ppCurveLen; index++) {
                ppCurvePoints.push(view.getFloat64(offset, true));
                offset += 8;
            }
            return { ppCurvePoints }
        },

        createOp5Packet(sessionMemAddr, hitFrames) {
            let buffer = new ArrayBuffer(1 + 8 + 8 + (4 + 4 + 8 + 1 + 1) * hitFrames.length);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x5); offset += 1;
            view.setBigInt64(offset, sessionMemAddr, true); offset += 8;
            view.setBigUint64(offset, BigInt(hitFrames.length), true); offset += 8;

            for (const frame of hitFrames) {
                view.setFloat32(offset, frame.x, true); offset += 4;
                view.setFloat32(offset, frame.y, true); offset += 4;
                view.setFloat64(offset, frame.timeStamp, true); offset += 8;
                view.setUint8(offset, (frame.k1 || frame.m1) ? 1 : 0); offset += 1;
                view.setUint8(offset, (frame.k2 || frame.m2) ? 1 : 0); offset += 1;
            }

            return new Uint8Array(buffer);
        },
        parseOp5Packet(view) {
            let offset = 1;
            let hitLen = view.getBigUint64(offset, true); offset += 8;
            let hits = [];
            for (let index = 0; index < hitLen; index++) {
                let paX = view.getFloat32(offset, true); offset += 4;
                let paY = view.getFloat32(offset, true); offset += 4;
                let diff = view.getFloat64(offset, true); offset += 8;
                hits.push({ paX, paY, diff });
            }

            return { hits };
        }
    }
})();
