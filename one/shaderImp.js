console.log("GLSL");
// Get the WebGL context
const canvas = document.getElementById('glcanvas');
// [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
canvas.width = Math.min(window.innerWidth, window.innerHeight, 400);
canvas.height = canvas.width;
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });

let mos = {x: 0, y: 0, p: new Uint8Array(4)};
canvas.addEventListener("mousemove", (e) => {
  mos.x = e.offsetX;
  mos.y = e.offsetY;
});

if (!gl) {
    throw Error('Unable to initialize WebGL. Your browser may not support it.');
    // return;
}

// Define Vertex Shader Source (GLSL)
const vsSource = `
    precision mediump float;
    
    attribute vec4 aVertexPosition;
    attribute vec2 aTexCoord;

    uniform float millis;

    varying vec2 pos;

    void main() {
        pos = aTexCoord;

        vec4 v = aVertexPosition;
        v.xy = v.xy * 2.0 - 1.0;

        v.y = v.y + tan(millis * 0.0005)*0.1;
        v.x = v.x + cos(millis * 0.001) * 0.1;

        gl_Position = v;
    }
`;

// Define Fragment Shader Source (GLSL)
const fsSource = `
    precision mediump float;

    uniform vec2 u_resolution;
    uniform float u_xoff;
    uniform float u_yoff;
    uniform float millis;

    varying vec2 pos;

    float rand(vec2 co) {
        return fract(sin(dot(co.xy * 214.7483647 ,vec2(12.9898,78.233))) * 43758.5453);
    }

    float valueNoise(vec2 uv, float oct) {
        vec2 lv = fract(uv*oct); // local value
        lv = smoothstep(0.0, 1.0, lv); // remove the diamonds with smoothstep ( lv*lv * (3.0 - 2.0*lv) )
        vec2 id = floor(uv*oct);

        float bl = rand(id + vec2(0, 0)); // bottom left
        float br = rand(id + vec2(1, 0)); // bottom right
        float bottom = mix(bl, br, lv.x); // linearly interpolate according to x of local value

        float tl = rand(id + vec2(0, 1)); // top left
        float tr = rand(id + vec2(1, 1)); // top right
        float top = mix(tl, tr, lv.x); // lerp between top left and right

        return mix(bottom, top, lv.y); // lerp between bottom and top according to y of local value (get center)
    }

    float fractionalNoise(vec2 uv) {
        const int N = 6;

        float oct = 4.0;
        float amp = 1.0;
        float ampSum = 0.0;

        float c = 0.0;

        for (int i = 0; i < N; ++i) {
            c += valueNoise(uv, oct) * amp;
            ampSum += amp;
            oct *= 2.0;
            amp *= 0.5;
        }
        c /= ampSum; // normalize
        return c;
    }

    float domainWarpedNoise(vec2 uv) {
        float n = fractionalNoise(uv);

        const int N = 2;

        for (int i = 0; i < N; ++i) {
            n = fractionalNoise(vec2(n));
        }
        return n;
    }

    float centralizedNoise(vec2 uv) {
        float diff = 0.001;
        float p1 = domainWarpedNoise(uv + vec2(diff, 0.0));
        float p2 = domainWarpedNoise(uv - vec2(diff, 0.0));
        float p3 = domainWarpedNoise(uv + vec2(0.0, diff));
        float p4 = domainWarpedNoise(uv - vec2(0.0, diff));
        return dot(normalize(vec3(p1 - p2, p3 - p4, diff)), vec3(0.5));
    }

    void main() {
        // gl_FragColor = vec4(vec3(pos.x), 1.0);
        // return;

        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv = uv + vec2(u_xoff, u_yoff);
        uv = uv * 1.0;

        float c1 = fractionalNoise(uv);
        float c2 = domainWarpedNoise(uv);
        float c3 = centralizedNoise(uv);

        float col = 0.0;
        col += c1 * 0.6;
        col += c2 * 0.35;
        col += c3 * 0.05;

        // rgb instead of black and white
        float r = valueNoise(uv+13.2, 7.0)-0.132;
        float col2 = fractionalNoise(uv+10.0) * 0.5 + domainWarpedNoise(uv+20.0) * 0.3 + centralizedNoise(uv-7.0) * 0.2;
        float col3 = fractionalNoise(uv+r) * 0.5 + domainWarpedNoise(uv+r) * 0.3 + centralizedNoise(uv+r) * 0.2;

        if (c1 < 0.50) {
            gl_FragColor = vec4(c1*0.1 + c3*0.1, c3*0.2, col2*0.9 + c2*0.1, 1.0) ; // rgb
        } else if (c1 < 0.60) {
            gl_FragColor = vec4(0.2, c2, 0.1, 1.0) ; // rgb    
        } else {
            gl_FragColor = vec4(vec3(col*0.98 + col3*0.02), 1.0) ; // rgb    
        }


        // gl_FragColor = vec4(col, col2, col3, 1.0) ; // rgb
        // gl_FragColor = vec4(vec3(col), 1.0) ; // bw
        
        // gl_FragColor = vec4(vec3(rand(uv)), 1.0);
        // gl_FragColor = vec4(vec3(valueNoise(uv, 8.0)), 1.0);
        // gl_FragColor = vec4(vec3(fractionalNoise(uv)), 1.0);
        // gl_FragColor = vec4(vec3(domainWarpedNoise(uv)), 1.0);
        // gl_FragColor = vec4(vec3(centralizedNoise(uv)), 1.0);
    }
`;

// Compile Shaders
function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

// Create Shader Program
const shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);

const uResolutionLocation = gl.getUniformLocation(shaderProgram, 'u_resolution'); // 1
const uXOffLocation = gl.getUniformLocation(shaderProgram, 'u_xoff'); // 1.1
const uYOffLocation = gl.getUniformLocation(shaderProgram, 'u_yoff'); // 1.2
const uMillisLocation = gl.getUniformLocation(shaderProgram, 'millis'); // 1.2

if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    // return null;
}

gl.useProgram(shaderProgram);

gl.uniform2f(uResolutionLocation, canvas.width, canvas.height); // 2

// Set up buffers (e.g., for a simple rectangle)
const positions = [
    0.0,  0.5,
    0.0, 1.0,
    1.0,  0.0,
    1.0, 0.5,
];

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

// Connect buffer to shader attribute
const vertexPositionLocation = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
gl.vertexAttribPointer(vertexPositionLocation, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(vertexPositionLocation);

let xoff = 0;
let yoff = 0;
const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
const startingTime = Date.now();

function step() {
    // currentTime = Date.now()*0.001;
    xoff += 0.005;
    yoff += 0.005;
    gl.uniform1f(uXOffLocation, xoff); // 2.1
    gl.uniform1f(uYOffLocation, Math.sin(yoff)+yoff); // 2.2
    gl.uniform1f(uMillisLocation, Date.now()-startingTime); // 2.2

    // Draw
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, positions.length/2);
    
    // gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // gl.readPixels(mos.x, mos.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mos.p);

    requestAnimationFrame(step);
}
step();
