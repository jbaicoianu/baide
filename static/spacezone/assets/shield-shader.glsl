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
    // Throbs and hums with dynamic noise patterns
    float n = noise(vUv * 10.0 + time * 2.0);
    float idle = 0.5 + 0.5 * sin(time * 1.5) * n;

    // Fresnel effect for edge glow
    float fresnel = pow(1.0 - dot(normalize(vec2(vUv.x - 0.5, vUv.y - 0.5)), vec2(0.0, 0.0)), 3.0);

    // Combine effects with Fresnel
    vec3 shieldColor = color * idle + vec3(fresnel);

    // Adjust transparency
    float alpha = 0.3 + 0.2 * idle + 0.1 * fresnel;

    gl_FragColor = vec4(shieldColor, alpha);
}