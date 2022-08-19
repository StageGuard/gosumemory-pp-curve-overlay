let gosuSocket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");
let ppCalcSocket = new ReconnectingWebSocket("ws://127.0.0.1:24051");

const canvasSize = 220;
const heatmapSize = 200;
const drawObjectCount = 10;
let heatmap = document.getElementById("heatmap");
heatmap.width = heatmap.height = canvasSize;
let context = heatmap.getContext("2d");

let gameState;

let currentCalcSessionAddr = null;
let currentHits = [];

const heatmapBGGradient = context.createRadialGradient(
    canvasSize / 2,canvasSize / 2,1,
    canvasSize / 2,canvasSize / 2,heatmapSize / 2
);
heatmapBGGradient.addColorStop(0,"rgb(130,230,194)");
heatmapBGGradient.addColorStop(1,"black");

function heatmapDraw() {
    context.fillStyle = heatmapBGGradient;
    context.fillRect(0, 0, canvasSize, canvasSize);

    context.save();
    context.beginPath();
    context.lineWidth = 3;
    context.shadowColor = 'white';
    context.strokeStyle = "white";
    context.shadowBlur = 15;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.arc(canvasSize / 2,canvasSize / 2,heatmapSize / 2,0,2 * Math.PI, false);
    context.stroke();
    context.restore();
    context.closePath();

    context.save();
    context.translate((canvasSize - heatmapSize) / 2, (canvasSize - heatmapSize) / 2);

    let lastNObjects = currentHits.slice(-drawObjectCount)
    for(const i in lastNObjects) {
        const hit = lastNObjects[i];
        const x = hit.paX * 200;
        const y = hit.paY * 200;
        const alpha = (Number(i) + (drawObjectCount - lastNObjects.length)) / (drawObjectCount - 1);

        const color = i == lastNObjects.length - 1 ? "rgb(179, 255, 102)" : `rgba(255, 204, 34, ${alpha})`

        context.beginPath();
        context.lineWidth = 3;
        context.shadowColor = 'grey';
        context.strokeStyle = color;
        context.shadowBlur = i == lastNObjects.length - 1 ? 5 : 5 * alpha;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.arc(x, y, 5,0,2 * Math.PI, false);
        context.stroke();

        context.fillStyle = color;
        context.arc(x, y, 5,0,2 * Math.PI, false);
        context.fill();
        context.closePath();
    }

    context.restore();
}

gosuSocket.onopen = () => { console.log("Successfully connected to gosumemory."); };
ppCalcSocket.onopen = () => { console.log("Successfully connected to pp calc server.") }

gosuSocket.onclose = () => { console.log("Socket gosumemory closed."); };
ppCalcSocket.onclose = () => { console.log("Socket pp calc server closed."); };

ppCalcSocket.onmessage = event => {
    event.data.arrayBuffer().then(buffer => {
        let view = new DataView(buffer);
        let offset = 0;

        let opCode = view.getUint8(offset);

        if (opCode === 0) {
            let result = CalcProcessor.parseCalcSessionPacket(view);
            currentCalcSessionAddr = result.sessionMemAddr;
            console.log("created calc session at " + currentCalcSessionAddr);
        } else if(opCode === 1) {
            let result = CalcProcessor.parseCalcSessionPacket(view);
            console.log("released calc addr: " + result.sessionMemAddr);
        } else if (opCode === 5) {
            let result = CalcProcessor.parseHitFramesPacket(view);
            for (const hit of result.hits) currentHits.push(hit);
            heatmapDraw();
        }
    });
}

gosuSocket.onmessage = event => {
    let data = JSON.parse(event.data);
    if (gameState !== data.menu.state) {
        gameState = data.menu.state;
        if (gameState === 2) {
            // Gameplay
            $({n: 0}).animate({n: 1}, {
                duration: 250,
                step: (now, fx) => heatmap.style.opacity = String(now)
            });

            currentHits = [];
            heatmapDraw();
            ppCalcSocket.send(CalcProcessor.createCalcSession((() => {
                let path = String(config.osuSongsPath);
                path += data.menu.bm.path.folder;
                path += "\\";
                path += data.menu.bm.path.file;
                return path;
            })(), data.menu.mods.num));
        } else {
            $({n: 1}).animate({n: 0}, {
                duration: 250,
                step: (now, fx) => heatmap.style.opacity = String(now)
            });

            if (currentCalcSessionAddr != null) {
                ppCalcSocket.send(CalcProcessor.releaseCalcSession(currentCalcSessionAddr));
                currentCalcSessionAddr = null;
            }
        }
    }

    if (gameState === 2 && currentCalcSessionAddr !== null) {
        ppCalcSocket.send(CalcProcessor.createHitFramesPacket(currentCalcSessionAddr, data.gameplay.hitEvents ? data.gameplay.hitEvents : []));
    }

}
