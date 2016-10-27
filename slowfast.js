class SlowFast {
    // JS version of https://itunes.apple.com/sg/app/slow-fast-slow-control-speed/id727309825?mt=8

    /*
    Original behaviour
    1. points
        - drag to move
        - long hold to remove
    2. everywhere else
        - touch to move time
        - long hold to add point
    3. curve is make of bezier curves
        - moving point doesn't affect more than 2 segments
    4. moving 1st and last points trims the videos
    5. can't move a point across an eariler or later point.
        - doing so scales the rest of the points.
    6. video loops
    7. nice balloon toolbars, and bubble / pill dialogs

    Extended behaviour to explore
    1. Use other easing functions (DONE)
        - also allow to move bezier control points
    2. allow addition of points only on the curve?
    3. allow removal of points by dragging it out
    4. re-order points if dragged across one another?
    5. allow time reversing
    6. undo / redo
    7. mouse / touch gestures
    8. debug points as a linear list.

    DONE
    - time ticker slider

    TODO
    - encode videos to smaller sizes for github!
    - split up touch / click to behaviour events
    - drag beyond canvas
    - retina support
    - to make time go backwards, should calculate entire length of spline
    - fix mouse events!
    - proper video loader and container
    */
}

const BG = '#2b2b2b';
const TXT_COLOR = '#aaa';
const MID_LINE = '#1b1b1b';
const SPACER = 5;
const BTN_COLOR = '#fefefe';
const CURVE_COLOR = '#ca0347'
const LINE_COLOR = '#ebebeb';
const EasingFunc = Easing.QuadraticInOut; // BezierInOut

/*
OTHER NOTES

For more spline interpolation, see
1. CatMull
https://github.com/mrdoob/three.js/blob/dev/src/extras/curves/CatmullRomCurve3.js
https://github.com/mrdoob/three.js/blob/dev/src/extras/curves/SplineCurve.js
https://github.com/mrdoob/three.js/blob/dev/src/extras/CurveUtils.js
2. ATAN?
https://github.com/llun/slowfast/blob/master/lib/transitions.js
3. Bezier Curves https://github.com/zz85/flowlab/blob/2aefe6c17a3a1593168cc2e3b3ac579ad54d31ce/node.js#L64
4. Others http://bl.ocks.org/mbostock/4342190

My guess from the behaviour of the slowfast app is bezier curves are being used.

Creative Common Videos
- http://www.wedistill.io/videos/175
- http://www.wedistill.io/videos/100
- http://mazwai.com/#/videos/221

http://www.quirksmode.org/mobile/viewports.html
http://www.quirksmode.org/mobile/viewports2.html

*/

class SlowFastUI {
    constructor(width, height, scale) {
        const canvas = document.createElement('canvas');

        this.dom = canvas;

        this.resize(width, height, scale);

        this.ctx = canvas.getContext('2d');

        document.body.appendChild(canvas);

        this.points = []; // list of {x, y} in floating points
        this.points.push({x: 0, y: 0});
        this.points.push({x: 0.333, y: 0});
        this.points.push({x: 0.667, y: 0});
        // this.points.push({x: 0.25, y: 0.5}); // this.points.push({x: 0.25, y: 0});
        // this.points.push({x: 0.75, y: -0.5}); // this.points.push({x: 0.75, y: 0});
        this.points.push({x: 1, y: 0});

        this.line = new Line({
            x0: 0, y0: 0, x1: 0, y1: height
        });
    }

    resize(width, height, scale) {
        const canvas = this.dom;
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        this.scale = scale;
        this.width = width;
        this.height = height;
    }

    setTime(t) {
        this.line.x0 = this.line.x1 = t * this.width;
    }

    convertPointToCoords(p) {
        const { width, height } = this;

        return {
            x:  p.x * width,
            y: (p.y + 1) * 0.5 * height
        }
    }

    convertCoordsToPoint(p) {
        const { width, height } = this;

        return {
            x: p.x / width,
            y: (p.y * 2 / height) - 1
        }
    }

    findClosestPoints(cx) {
        if (cx < 0 || cx > 1) return;
        let p0, p1;
        const points = this.points;

        // assume points have been sorted
        for (let p = 0; p < points.length; p++) {
            let point = points[p];
            if (point.x <= cx) {
                p0 = point;
            }
            else if (point.x >= cx) {
                p1 = point;
                return [p0, p1];
            }
        }
    }

    yValueAt(cx) {
        const pairs = this.findClosestPoints(cx);
        if (pairs) {
            const [p0, p1] = pairs;
            const dx = p1.x - p0.x;
            const t = (cx - p0.x) / dx;

            const y = EasingFunc(t);
            const dy = p1.y - p0.y;
            return p0.y + dy * y;
        }
    }

    render() {
        const { ctx, width, height, points } = this;

        ctx.save();
        ctx.scale(this.scale, this.scale);

        // bg color of course
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);

        // center line
        ctx.strokeStyle = MID_LINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // label axis
        ctx.font = '10px Helvetica';
        ctx.fillStyle = TXT_COLOR;
        ctx.textBaseline = 'top';
        ctx.fillText('FAST', SPACER, SPACER);

        ctx.textBaseline = 'bottom';
        ctx.fillText('SLOW', SPACER, height - SPACER);

        ctx.strokeStyle = CURVE_COLOR;


        // Prepare graphical objects (TODO reuse items or not?)

        // render spline
        this.curve = new Curve(points.map(this.convertPointToCoords, this), this);

        // render points
        this.circles = points.map((p) => new Circle(
            width * p.x, height * (1 + p.y) * 0.5, 11, BTN_COLOR, p));

        if (!this.ghost) {
            this.ghost = new Circle(0, 0, 10, '#333333');
        }

        let leftrect, rightrect, wh;
        if (points[0].x > 0) {
            wh = this.convertPointToCoords({
                x: points[0].x, y: 0
            });
            leftrect = new Rect(0, 0, wh.x, height);
        }

        if (points[points.length - 1].x < 1) {
            wh = this.convertPointToCoords({
                x: points[points.length - 1].x, y: height
            });
            rightrect = new Rect(wh.x, 0, width - wh.x, height);
        }

        // Items for rendering
        this.children = new Set();
        if (leftrect) this.children.add(leftrect);
        if (rightrect) this.children.add(rightrect);
        this.children.add(this.curve);
        this.children.add(this.line);
        this.circles.forEach(c => this.children.add(c));
        this.children.add(this.ghost);

        for (let c of this.children) {
            c.render(ctx);
        }

        ctx.restore();
    }
}

/*
class Emitter {
    constructor() {

    }

    on() {

    }

    off() {

    }

    emit() {

    }
}
*/

class EHandler {
    constructor(dom) {
        this.handles = {};
        this.dom = dom;
    }

    bind(k, f) {
        this.handles[k] = f.bind(this);
        this.dom.addEventListener(k, this.handles[k]);
    }

    unbind(k) {
        this.dom.removeEventListener(k, this.handles[k]);
    }
}


class ClickHandler extends EHandler {
    constructor(dom) {
        super(dom);
        this.nodeDown = null;
        this.handle();
    }

    handle() {
        this.bind('dblclick', this.ondblclick)
        this.bind('mousedown', this.onmousedown);
        this.bind('mousemove', this.onmousemove);
        this.bind('mouseup', this.onmouseup);

        this.bind('touchstart', this.ontouchstart);
        this.bind('touchmove', this.ontouchmove);
        this.bind('touchend', this.ontouchend);
    }

    unhandle() {
        for (let k in this.handles) {
            this.unbind(k);
        }
    }

    ontouchstart(e) {
        const { clientX, clientY } = e.touches[0];
        const { left, top } = this.dom.getBoundingClientRect();
        console.log(clientX, clientY, left, top, e);
        const x = clientX - left;
        const y = clientY - top;
        this.onpokedown(x, y);
    }

    ontouchmove(e) {
        const { clientX, clientY } = e.touches[0];
        const { left, top } = this.dom.getBoundingClientRect();
        const x = clientX - left;
        const y = clientY - top;
        this.onpokemove(x, y);
    }

    ontouchend(e) {
        this.onpokeup();
    }

    onmousedown(e) {
        const { clientX, clientY } = e;
        const { left, top } = this.dom.getBoundingClientRect();
        const x = clientX - left;
        const y = clientY - top;
        this.onpokedown(x, y);
    }

    onmousemove(e) {
        const { clientX, clientY } = e;
        const { left, top } = this.dom.getBoundingClientRect();
        const x = clientX - left;
        const y = clientY - top;
        this.onpokemove(x, y);
    }

    onmouseup(e) {
        const { clientX, clientY } = e;
        const { left, top } = this.dom.getBoundingClientRect();
        const x = clientX - left;
        const y = clientY - top;
        this.onpokeup(x, y);
    }

    onpokedown(mx, my) {
        const node = findNode(mx, my);
        if (node) {
            this.nodeDown = {
                offset: {
                    x: mx - node.x,
                    y: my - node.y
                },
                node: node
            }
        }
        else {
            // - W
            const p = slowFast.findClosestPoints(mx / slowFast.width);
            const points = slowFast.points;
            if (p[0]) {
                const insert = points.indexOf(p[1]);

                points.splice(insert, 0, slowFast.convertCoordsToPoint({
                    x: mx,
                    y: my
                }));
            }
        }
    }

    ondblclick(e) {
        // - W
        const mx = e.layerX;
        const my = e.layerY;
        const node = findNode(mx, my);

        if (node) {
            const points = slowFast.points;
            const index = points.indexOf(node.tag);
            if (index === 0 || index === points.length - 1) return;
            points.splice(index, 1);
        }

    }

    onpokemove(mx, my) {

        // update line
        // slowFast.line.x0 = slowFast.line.x1 = mx;

        // update ghost
        slowFast.ghost.x = mx;
        slowFast.ghost.y = my;

        if (this.nodeDown) {
            const { node, offset } = this.nodeDown;
            if (node instanceof Circle && node !== slowFast.ghost) {
                node.x = mx - offset.x;
                node.y = my - offset.y;
                const convert = slowFast.convertCoordsToPoint(node);
                // - W
                node.tag.x = convert.x;
                node.tag.y = convert.y;
            }
        }
        else {
            const node = findNode(mx, my);
            if (node) {
                document.body.style.cursor = 'pointer';
            }
            else {
                document.body.style.cursor = 'auto';
            }
        }
    }

    onpokeup(e) {
        this.nodeDown = null;
    }
}




function findNode(mx, my) {
    const ctx = slowFast.ctx;

    var nodes = [];
    for (let node of slowFast.circles) {
        node.path(ctx);
        if (ctx.isPointInPath(mx, my)) {
            // nodes.push(node);
            return node;
        }
    }

    // return nodes.pop();
}

class Label {
    constructor(label, style) {
        this.dom = document.createElement('span');
        this.dom.style.fontFamily = 'monospace';
        Object.assign(this.dom.style, style);
        document.body.appendChild(this.dom);
        this.label = label;
    }

    setText(text) {
        this.dom.innerHTML = this.label + ': ' + text;
    }
}

class Ticker {
    constructor() {
        this.duration = 5 * 1000; // 10s
        this.currentTime = 0;
        this.lastTick = performance.now();
    }

    update(speed) {
        speed = speed || 1;
        const now = performance.now();
        const lapsed = now - this.lastTick;
        this.currentTime += lapsed * speed;
        this.currentTime %= this.duration;
        this.lastTick = now;
    }
}

class TimeControlVideoTicker {
    constructor() {
        this.duration = 5 * 1000; // 10s
        this.currentTime = 0;
        this.lastTick = performance.now();
    }

    update(speed) {
        speed = speed || 1;
        const now = performance.now();
        const lapsed = now - this.lastTick;
        this.currentTime += lapsed * speed;
        this.currentTime %= this.duration;
        this.lastTick = now;
        video.currentTime = this.currentTime / 1000;
    }
}

class VideoTicker {
    constructor() {
        this.video = document.getElementById('video');
    }

    get currentTime() {
        return this.video.currentTime * 1000;
    }

    get duration() {
        return this.video.duration * 1000;
    }

    update(speed) {
        if (isNaN(speed)) return;
        this.video.playbackRate = speed;
    }
}

// slowFast = new SlowFastUI(600, 280, window.devicePixelRatio);
const shorter = innerWidth < innerHeight ? innerWidth : innerHeight;
slowFast = new SlowFastUI(shorter, shorter / 2, window.devicePixelRatio);

click = new ClickHandler(slowFast.dom);

// ticker = new Ticker();
ticker = new VideoTicker();
// ticker = new TimeControlVideoTicker();


const MAX_SPEED = 6;
const LABEL_STYLE = {
    position: 'absolute',
    display: 'inline-block',
    background: BG,
    color: TXT_COLOR,
    padding: '6px',
    borderRadius: '6px',
    left: 'auto',
    right: 'auto'
};

timeLabel = new Label('Time', LABEL_STYLE);
speedLabel = new Label('Speed', Object.assign({top: 10, left: 10}, LABEL_STYLE));

animate();

window.addEventListener('resize', () => {
    // slowFast.resize(slowFast.width, slowFast.height, window.devicePixelRatio);
    const shorter = innerWidth < innerHeight ? innerWidth : innerHeight;
    if (innerWidth > innerHeight) {
        document.body.style.transform = 'rotate(90deg)';
    }
    else {
        document.body.style.transform = '';
    }
    slowFast.resize(shorter, shorter / 2, window.devicePixelRatio);
});

window.addEventListener('orientationchange', (e) => {
    switch (window.orientation) {
    case 0:
        // Portrait
        document.body.style.transform = 'rotate(0deg)';
        break;
    case 180:
        // Portrait (Upside-down)
        document.body.style.transform = 'rotate(0deg)';
        break;

    case -90:
        // Landscape (Clockwise)
        document.body.style.transform = 'rotate(90deg)';
        break;

    case 90:
        // Landscape  (Counterclockwise)
        document.body.style.transform = 'rotate(-90deg)';
        break;
    }
});


document.body.addEventListener('mousedown', (e) => {
    e.preventDefault();
});

document.body.addEventListener('touchstart', (e) => {
    e.preventDefault();
});


// var z = {};
// Object.keys(window).filter(k => /^on/.test(k)).forEach(k => {
//     window[k] = (e) => {
//         if (!z[k]) console.log(k, e)
//         z[k] = 1;
//     }
// })

function animate() {
    const t = ticker.currentTime / ticker.duration;
    const y = -slowFast.yValueAt(t);
    const speed = (y >= 0) ? y * MAX_SPEED + 1 : 1 / (-y * MAX_SPEED + 1);

    slowFast.setTime(t);
    ticker.update(speed);

    speedLabel.setText(speed.toFixed(2) + 'x');
    timeLabel.setText((ticker.currentTime / 1000).toFixed(2) + 's');

    slowFast.render();
    requestAnimationFrame(animate);
}