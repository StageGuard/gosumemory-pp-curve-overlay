let gosuSocket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");
let ppCalcSocket = new ReconnectingWebSocket("ws://127.0.0.1:24051");

const canvasSize = 600;
const heatmapSize = 300;
let heatmap = document.getElementById("heatmap");
heatmap.width = heatmap.height = canvasSize;
let context = heatmap.getContext("2d");

let gameState;
let gameTime;

let currentCalcSessionAddr = null;

class HitDrawManager {
    constructor(ctx) {
        this.context = ctx;
        this.loopThread = null;

        this.currentPos = { x: null, y: null };
        this.currentHit = null;

        this.minusHitState = new Map();
    }

    pushHit(hit) {
        const x = (canvasSize - heatmapSize) / 2 + heatmapSize * hit.paX;
        const y = (canvasSize - heatmapSize) / 2 + heatmapSize * hit.paY;

        if (this.currentPos.x != null || this.currentPos.y != null) {
            this.spawnMinusHitAlphaThread(this.currentHit);
        }
        this.currentPos = { x, y };
        this.currentHit = hit;
    }

    spawnMinusHitAlphaThread(hit) {
        const x = (canvasSize - heatmapSize) / 2 + heatmapSize * hit.paX;
        const y = (canvasSize - heatmapSize) / 2 + heatmapSize * hit.paY;
        let key = String(gameTime);

        this.minusHitState.set(key, { x, y, time: 1000, type: hit.type });
    }

    startDrawLoop() {
        this.loopThread = setInterval(() => {
            this.heatmapDraw();
        });

    }
    stopDrawLoop() {
        if (this.loopThread != null) {
            clearInterval(this.loopThread);
            this.loopThread = null;
            this.currentPos = { x: null, y: null };
            this.currentHit = null;
            this.minusHitState.clear();
        }
    }

    heatmapDraw() {
        this.context.fillStyle = "black";
        this.context.fillRect(0, 0, canvasSize, canvasSize);

        this.context.save();
        this.context.beginPath();
        this.context.lineWidth = 18;
        this.context.strokeStyle = "rgb(255, 255, 255, 0.8)";
        this.context.arc(canvasSize / 2,canvasSize / 2,heatmapSize / 2,0,2 * Math.PI, false);
        this.context.stroke();
        this.context.closePath();
        this.context.restore();

        this.context.save();
        this.context.beginPath();
        this.context.lineWidth = 18;
        this.context.strokeStyle = "rgb(255, 255, 255, 0.2)";
        this.context.arc(canvasSize / 2,canvasSize / 2,heatmapSize / 2 - 18,0,2 * Math.PI, false);
        this.context.stroke();
        this.context.closePath();
        this.context.restore();
        this.context.save();

        for (const entry of this.minusHitState.entries()) {
            let state = entry[1];
            this.context.beginPath();
            this.context.lineWidth = 7;

            let alpha = 1;
            if (state.time <= 150) {
                alpha = state.time / 150;
            }

            if (state.type === 0) {
                this.context.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
            } else if (state.type === 1) {
                this.context.strokeStyle = `rgba(50, 188, 231, ${alpha})`;
            } else if (state.type === 2) {
                this.context.strokeStyle = `rgba(87, 277, 19, ${alpha})`;
            } else {
                this.context.strokeStyle = `rgba(218, 174, 70, ${alpha})`;
            }

            const decTime = this.minusHitState.get(entry[0]).time - 1;
            if (decTime <= 0) {
                this.minusHitState.delete(entry[0]);
            } else {
                this.minusHitState.get(entry[0]).time = decTime;
            }

            this.context.moveTo(state.x - 10, state.y - 10);
            this.context.lineTo(state.x + 10, state.y + 10);
            this.context.moveTo(state.x + 10, state.y - 10);
            this.context.lineTo(state.x - 10, state.y + 10);
            this.context.closePath();
            this.context.stroke();
        }

        if (this.currentPos.x != null && this.currentPos.y != null) {
            this.context.beginPath();
            this.context.lineWidth = 8;
            this.context.lineCap = "round";
            this.context.strokeStyle = "white";
            this.context.moveTo(this.currentPos.x - 15, this.currentPos.y);
            this.context.lineTo(this.currentPos.x + 15, this.currentPos.y);
            this.context.moveTo(this.currentPos.x, this.currentPos.y - 15);
            this.context.lineTo(this.currentPos.x, this.currentPos.y + 15);
            this.context.stroke();
            this.context.closePath();
        }

        context.restore();
    }
}

const hitDrawMgr = new HitDrawManager(context);

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
            for (const hit of result.hits) hitDrawMgr.pushHit(hit);
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

            ppCalcSocket.send(CalcProcessor.createCalcSession((() => {
                let path = String(config.osuSongsPath);
                path += data.menu.bm.path.folder;
                path += "\\";
                path += data.menu.bm.path.file;
                return path;
            })(), data.menu.mods.num));
            hitDrawMgr.startDrawLoop();
        } else {
            $({n: 1}).animate({n: 0}, {
                duration: 250,
                step: (now, fx) => heatmap.style.opacity = String(now)
            });

            hitDrawMgr.stopDrawLoop();
            if (currentCalcSessionAddr != null) {
                ppCalcSocket.send(CalcProcessor.releaseCalcSession(currentCalcSessionAddr));
                currentCalcSessionAddr = null;
            }
        }
    }

    if (gameState === 2 && currentCalcSessionAddr !== null) {
        ppCalcSocket.send(CalcProcessor.createHitFramesPacket(currentCalcSessionAddr, data.gameplay.hitEvents ? data.gameplay.hitEvents : []));
    }

    gameTime = data.menu.bm.time.current;

}
