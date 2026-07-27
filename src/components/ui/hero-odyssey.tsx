"use client";

/**
 * WebGL lightning field, adapted from the hero-odyssey component.
 *
 * Changes from the original:
 *   - The render loop is now cancelled on unmount and GL resources are
 *     deleted. The original called requestAnimationFrame recursively with no
 *     cancellation, so every mount leaked a permanently running loop.
 *   - Rendering pauses when the canvas scrolls out of view, so the shader is
 *     not burning GPU behind the fold.
 *   - Honours prefers-reduced-motion by painting a single static frame.
 *   - Accounts for devicePixelRatio, and caps it, so the effect is crisp on
 *     retina without quadrupling the fragment count.
 *   - Degrades to a CSS gradient when WebGL is unavailable instead of
 *     rendering nothing.
 */

import React, { useEffect, useRef, useState } from "react";

export interface LightningProps {
  /** Hue in degrees, 0-360. */
  hue?: number;
  xOffset?: number;
  speed?: number;
  intensity?: number;
  size?: number;
  className?: string;
}

const VERT = `
  attribute vec2 aPosition;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAG = `
  precision mediump float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float uHue;
  uniform float uXOffset;
  uniform float uSpeed;
  uniform float uIntensity;
  uniform float uSize;

  #define OCTAVE_COUNT 10

  vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
  }

  float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  mat2 rotate2d(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat2(c, -s, s, c);
  }

  float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float a = hash12(ip);
    float b = hash12(ip + vec2(1.0, 0.0));
    float c = hash12(ip + vec2(0.0, 1.0));
    float d = hash12(ip + vec2(1.0, 1.0));
    vec2 t = smoothstep(0.0, 1.0, fp);
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < OCTAVE_COUNT; ++i) {
      value += amplitude * noise(p);
      p *= rotate2d(0.45);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = 2.0 * uv - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    uv.x += uXOffset;

    uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;

    float dist = abs(uv.x);
    vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
    vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
    col = pow(col, vec3(1.0));
    fragColor = vec4(col, 1.0);
  }

  void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
  }
`;

export const Lightning: React.FC<LightningProps> = ({
  hue = 218,
  xOffset = 0,
  speed = 1,
  intensity = 1,
  size = 1,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const compile = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Lightning shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compile(VERT, gl.VERTEX_SHADER);
    const fragmentShader = compile(FRAG, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      setFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Lightning program link error:", gl.getProgramInfoLog(program));
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "iResolution");
    const uTime = gl.getUniformLocation(program, "iTime");
    const uHue = gl.getUniformLocation(program, "uHue");
    const uXOffset = gl.getUniformLocation(program, "uXOffset");
    const uSpeed = gl.getUniformLocation(program, "uSpeed");
    const uIntensity = gl.getUniformLocation(program, "uIntensity");
    const uSize = gl.getUniformLocation(program, "uSize");

    const resize = () => {
      // Cap DPR: the fragment shader runs 10 octaves of fbm per pixel, so
      // full retina resolution triples the cost for no visible gain.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    let frame = 0;
    let visible = true;
    const startTime = performance.now();

    const draw = (nowMs: number) => {
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (nowMs - startTime) / 1000);
      gl.uniform1f(uHue, hue);
      gl.uniform1f(uXOffset, xOffset);
      gl.uniform1f(uSpeed, speed);
      gl.uniform1f(uIntensity, intensity);
      gl.uniform1f(uSize, size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = () => {
      if (!visible) return;
      draw(performance.now());
      frame = requestAnimationFrame(loop);
    };

    if (prefersReducedMotion) {
      // One static frame: the atmosphere without the motion.
      resize();
      draw(startTime + 2000);
    } else {
      frame = requestAnimationFrame(loop);
    }

    // Stop rendering when the hero is scrolled away.
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowVisible = entry.isIntersecting;
        if (nowVisible === visible) return;
        visible = nowVisible;
        if (visible && !prefersReducedMotion) frame = requestAnimationFrame(loop);
        else cancelAnimationFrame(frame);
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [hue, xOffset, speed, intensity, size]);

  if (failed) {
    // No WebGL: keep the atmosphere with a static gradient rather than a hole.
    return (
      <div
        aria-hidden
        className={`h-full w-full bg-[radial-gradient(60%_100%_at_50%_0%,rgba(110,155,255,0.28),transparent_70%)] ${className}`}
      />
    );
  }

  return <canvas ref={canvasRef} aria-hidden className={`h-full w-full ${className}`} />;
};

export default Lightning;
