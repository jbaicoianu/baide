// static/spacezone/assets/shield-shader.glsl

uniform vec3 color;
uniform float time;
uniform vec2 hitUV;
uniform float hitTrigger;
uniform vec2 resolution;

varying vec2 vUv;

// Improved noise function using multiple octaves
float noise(vec2 p) {
    float total = 0.0;
    float frequency = 1.0;
    float amplitude = 0.5;
    for(int i = 0; i < 4; i++) {
        total += amplitude * fract(sin(dot(p * frequency, vec2(12.9898,78.233))) * 43758.5453);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return total;
}

void main() {
    vec3 tmpcolor = vec3(1.0,0,0);
    // Throbs and hums with dynamic noise patterns
    float n = noise(vUv * 10.0 + time * 2.0);
    float idle = 0.5 + 0.5 * sin(time * 1.5) * n;

    // Combine effects without Fresnel
    vec3 shieldColor = tmpcolor * idle;

    // Adjust transparency
    float alpha = 0.3 + 0.2 * idle;

    gl_FragColor = vec4(shieldColor, alpha);
}