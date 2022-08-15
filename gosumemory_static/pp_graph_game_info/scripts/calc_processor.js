this.CalcProcessor = (function () {
    const textEncoder = new TextEncoder();

    return {
        createOp1Packet(path, mods) {
            let pathArr = textEncoder.encode(path);
            let buffer = new ArrayBuffer(pathArr.length + 4 + 4 + 1);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x1); offset += 1;
            view.setUint32(offset, mods, true); offset += 4;
            view.setUint32(offset, pathArr.length, true); offset += 4;

            let u8Arr = new Uint8Array(buffer);
            u8Arr.set(pathArr, offset);

            return u8Arr;
        },
        parseOp1Packet(view) {
            let offset = 1;
            let sessionMemAddr = view.getBigInt64(offset, true); offset += 8;
            let ppCurveLen = view.getBigUint64(offset, true); offset += 8;
            let ppCurvePoints = [];
            for (let index = 0; index < ppCurveLen; index++) {
                ppCurvePoints.push(view.getFloat64(offset, true));
                offset += 8;
            }
            return { sessionMemAddr, ppCurvePoints }
        },

        createOp2Packet(sessionMemAddr, comboList, misses) {
            let buffer = new ArrayBuffer(1 + 8 + 8 + 8 + 8 * comboList.length);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x2); offset += 1;
            view.setBigUint64(offset, sessionMemAddr, true); offset += 8;
            view.setBigUint64(offset, BigInt(misses), true); offset += 8;
            view.setBigUint64(offset, BigInt(comboList.length), true); offset += 8;

            for (const i in comboList) {
                view.setBigUint64(offset, BigInt(comboList[i]), true); offset += 8;
            }

            return new Uint8Array(buffer);
        },
        parseOp2Packet(view) {
            let offset = 1;

            let ppCurveLen = view.getBigUint64(offset, true); offset += 8;
            let ppCurvePoints = [];
            for (let index = 0; index < ppCurveLen; index++) {
                ppCurvePoints.push(view.getFloat64(offset, true));
                offset += 8;
            }

            return { ppCurvePoints };
        },

        createOp4Packet(sessionMemAddr) {
            let buffer = new ArrayBuffer(1 + 8);
            let view = new DataView(buffer);
            let offset = 0;

            view.setUint8(offset, 0x4); offset += 1;
            view.setBigUint64(offset, sessionMemAddr, true); offset += 8;

            return new Uint8Array(buffer);
        },
        parseOp4Packet(view) {
            let offset = 1;

            let sessionMemAddr = view.getBigInt64(offset, true); offset += 8;

            return { sessionMemAddr };
        }
    }
})();
