console.log("GLSL");
// Get the WebGL context
const canvas = document.getElementById('glcanvas');
// [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
// canvas.width = Math.min(window.innerWidth, window.innerHeight);
// canvas.height = canvas.width;
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });

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
        // v.xy = v.xy * 2.0 - 1.0;

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

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) { // simplex noise
        // Precompute values for skewed triangular grid
        const vec4 C = vec4(0.211324865405187,
                            // (3.0-sqrt(3.0))/6.0
                            0.366025403784439,
                            // 0.5*(sqrt(3.0)-1.0)
                            -0.577350269189626,
                            // -1.0 + 2.0 * C.x
                            0.024390243902439);
                            // 1.0 / 41.0

        // First corner (x0)
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);

        // Other two corners (x1, x2)
        vec2 i1 = vec2(0.0);
        i1 = (x0.x > x0.y)? vec2(1.0, 0.0):vec2(0.0, 1.0);
        vec2 x1 = x0.xy + C.xx - i1;
        vec2 x2 = x0.xy + C.zz;

        // Do some permutations to avoid
        // truncation effects in permutation
        i = mod289(i);
        vec3 p = permute(
                permute( i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0 ));

        vec3 m = max(0.5 - vec3(
                            dot(x0,x0),
                            dot(x1,x1),
                            dot(x2,x2)
                            ), 0.0);

        m = m*m ;
        m = m*m ;

        // Gradients:
        //  41 pts uniformly over a line, mapped onto a diamond
        //  The ring size 17*17 = 289 is close to a multiple
        //      of 41 (41*7 = 287)

        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;

        // Normalise gradients implicitly by scaling m
        // Approximation of: m *= inversesqrt(a0*a0 + h*h);
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);

        // Compute final noise value at P
        vec3 g = vec3(0.0);
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * vec2(x1.x,x2.x) + h.yz * vec2(x1.y,x2.y);
        return 130.0 * dot(m, g);
    }

    float fractalNoise(vec2 uv) {
        const int N = 6;
        float mully = 0.5;
        
        float col = 0.0;

        for (int i = 0; i < N; i++) {
            col += (snoise(uv * (float(i)+1.0)) * 0.5 + 0.5) * mully;
            mully *= 0.5;
        }
        return col;
    }

    float domainWarpedNoise(vec2 uv) {
        float n = fractalNoise(uv);

        const int N = 3;

        for (int i = 0; i < N; ++i) {
            n = fractalNoise(vec2(n));
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
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv = uv + vec2(u_xoff, u_yoff);
        uv = uv * 2.0;
        
        float c1 = fractalNoise(uv);
        float c2 = domainWarpedNoise(uv);
        float c3 = centralizedNoise(uv);

        float col = 0.0;
        col += c1 * 0.5;
        col += c2 * 0.25;
        col += c3 * 0.125;

        if (c1 < 0.50) {
            gl_FragColor = vec4(vec3(0.2*c1, 0.1*c3, c2), 1.0);
        } else if (c1 < 0.70) {
            gl_FragColor = vec4(vec3(0.2*c1, c1*c2, 0.1*c2), 1.0);
        } else {
            gl_FragColor = vec4(vec3(dot(vec2((col*c2 + col*c1 + col*c2)*0.33), vec2(c2, c1))), 1.0);
        }
        // gl_FragColor = vec4(vec3(col), 1.0);
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
    -1.0,  0.0,
    -1.0, 1.0,
    1.0,  -1.0,
    1.0, 0.0,
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
// const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
const startingTime = Date.now();

function step() {
    // currentTime = Date.now()*0.001;
    xoff += 0.001;
    yoff += 0.001;
    gl.uniform1f(uXOffLocation, xoff); // 2.1
    gl.uniform1f(uYOffLocation, Math.sin(yoff*10)/10+yoff); // 2.2
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
