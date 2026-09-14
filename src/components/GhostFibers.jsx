import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import './GhostFibers.css'

const hexToRgb = (hex) => {
  const value = hex.trim().replace(/^#/, '')
  const normalized = value.length === 3 ? value.replace(/./g, (channel) => channel + channel) : value
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized)
  if (!match) return [1, 1, 1]
  return [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
}

const setColor = (uniform, hex) => {
  const color = hexToRgb(hex)
  uniform.value[0] = color[0]
  uniform.value[1] = color[1]
  uniform.value[2] = color[2]
}

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution; uniform float uTime; uniform float uSpeed; uniform float uScale;
uniform float uRotation; uniform float uLayers; uniform float uWaveAmplitude; uniform float uWaveFrequency;
uniform float uWaveSpeed; uniform float uLayerSpeed; uniform float uTwist; uniform float uTwistFrequency;
uniform float uTwistSpeed; uniform float uLineFrequency; uniform float uLineSpacing; uniform float uLineSharpness;
uniform float uGlowFalloff; uniform float uGlowIntensity; uniform float uBrightness; uniform float uBlueBoost;
uniform float uVignette; uniform float uGrain; uniform float uRotationSpeed; uniform float uLightMode;
uniform vec3 uLineColor; uniform vec3 uGlowColor; out vec4 fragColor;
#define MAX_LAYERS 10
mat2 rotate2d(float angle) { float s=sin(angle), c=cos(angle); return mat2(c,-s,s,c); }
float grainHash(vec2 p) { p=floor(p); return fract(52.9829189*fract(dot(p,vec2(.065,.005)))); }
float layeredGrain(vec2 p) { p=mod(p+vec2(uTime*30.,-uTime*21.),1024.); p=mat2(.8,-.5,.5,.8)*p; return .4*grainHash(p)+.25*grainHash(p*2.+17.)+.2*grainHash(p*4.+47.)+.1*grainHash(p*8.+113.)+.05*grainHash(p*16.+191.); }
void main() {
  vec2 resolution=max(uResolution,vec2(1.)); vec2 uv=(2.*gl_FragCoord.xy-resolution)/resolution.y; float time=uTime*uSpeed;
  vec3 backdrop=mix(vec3(.070588,.058824,.090196),vec3(1.),step(.5,uLightMode));
  vec3 centerTone=max(uLineColor*.85567-uGlowColor*.06186,vec3(0.)); vec3 cloudTone=uLineColor*.19588+uGlowColor*.2268;
  vec2 p=rotate2d(radians(uRotation)+time*uRotationSpeed)*uv/max(uScale,.05); vec3 color=vec3(0.); float fiberField=0.;
  for(int index=0;index<MAX_LAYERS;index++){ float fi=float(index)+1.; if(fi>uLayers) break;
    p+=uWaveAmplitude*sin(p.yx*fi*uWaveFrequency+time*(uWaveSpeed+fi*uLayerSpeed)); float radius=length(p); float a=atan(p.y,p.x);
    a+=sin(radius*uTwistFrequency-time*uTwistSpeed+fi)*uTwist; p=vec2(cos(a),sin(a))*radius;
    float lines=abs(sin(p.x*(uLineFrequency+fi*uLineSpacing)+sin(p.y*3.+time))); lines=pow(max(0.,1.-lines),uLineSharpness);
    fiberField+=lines/fi; color+=uLineColor*lines/fi; float glow=exp(-uGlowFalloff*abs(sin(p.x*3.+time+fi))); color+=uGlowColor*glow*uGlowIntensity/(fi*2.);
  }
  float center=exp(-2.2*dot(uv,uv)); color+=centerTone*center;
  float cloud=exp(-1.5*length(uv+vec2(sin(time*.3)*.25,cos(time*.25)*.18))); color+=cloudTone*cloud;
  float edge=1.-smoothstep(.35,1.45,length(uv)); color*=mix(1.-uVignette,1.,edge); color=1.-exp(-color*uBrightness); color.b*=uBlueBoost;
  vec3 outputColor=backdrop+color;
  if(uLightMode>.5){ float fibers=pow(smoothstep(.12,1.05,fiberField)*mix(1.-uVignette,1.,edge),1.5); outputColor=mix(backdrop,mix(backdrop,uGlowColor,.16),(center*.025+cloud*.015)*edge); outputColor=mix(outputColor,mix(backdrop,uLineColor,.52),fibers*.3); }
  outputColor=clamp(outputColor+(layeredGrain(gl_FragCoord.xy)-.5)*uGrain,0.,1.); fragColor=vec4(outputColor,1.);
}`

const contexts = new WeakMap()

export default function GhostFibers({ lineColor='#140E35', glowColor='#3437A0', speed=.2, scale=2, rotation=0, rotationSpeed=.25, layers=4, waveAmplitude=.015, waveFrequency=3, waveSpeed=.15, layerSpeed=.08, twist=.1, twistFrequency=5, twistSpeed=1.2, lineFrequency=5, lineSpacing=2, lineSharpness=16, glowFalloff=10, glowIntensity=1.6, brightness=2, blueBoost=1.25, vignette=.8, grain=.05, lightMode=false, dpr=1, fps=30, paused=false, className='' }) {
  const containerRef = useRef(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const renderer = new Renderer({ webgl: 2, alpha: false, antialias: false, dpr: Math.min(Math.max(dpr, .5), 2) })
    const gl = renderer.gl; const canvas = gl.canvas
    canvas.style.cssText = 'width:100%;height:100%;display:block'; canvas.setAttribute('aria-hidden','true'); container.appendChild(canvas)
    const program = new Program(gl, { vertex, fragment, uniforms: { uResolution:{value:new Float32Array([1,1])}, uTime:{value:0}, uSpeed:{value:.2}, uScale:{value:2}, uRotation:{value:0}, uRotationSpeed:{value:.25}, uLayers:{value:4}, uWaveAmplitude:{value:.015}, uWaveFrequency:{value:3}, uWaveSpeed:{value:.15}, uLayerSpeed:{value:.08}, uTwist:{value:.1}, uTwistFrequency:{value:5}, uTwistSpeed:{value:1.2}, uLineFrequency:{value:5}, uLineSpacing:{value:2}, uLineSharpness:{value:16}, uGlowFalloff:{value:10}, uGlowIntensity:{value:1.6}, uBrightness:{value:2}, uBlueBoost:{value:1.25}, uVignette:{value:.8}, uGrain:{value:.05}, uLightMode:{value:0}, uLineColor:{value:new Float32Array(hexToRgb('#140E35'))}, uGlowColor:{value:new Float32Array(hexToRgb('#3437A0'))} } })
    const mesh = new Mesh(gl, { geometry:new Triangle(gl), program }); let frameId=0; let elapsed=0; let previous=performance.now(); let last=0; let visible=true; const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const render=()=>renderer.render({scene:mesh}); const canAnimate=()=>visible&&!document.hidden&&!paused&&!reduced.matches
    const loop=(now)=>{ frameId=0; if(!canAnimate()) return; elapsed+=Math.min((now-previous)/1000,.1); previous=now; if(now-last>=1000/fps){program.uniforms.uTime.value=elapsed;render();last=now} frameId=requestAnimationFrame(loop) }
    const start=()=>{if(canAnimate()&&!frameId){previous=performance.now();frameId=requestAnimationFrame(loop)}}; const stop=()=>{if(frameId)cancelAnimationFrame(frameId);frameId=0}
    const resize=()=>{const r=container.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height));program.uniforms.uResolution.value[0]=gl.drawingBufferWidth;program.uniforms.uResolution.value[1]=gl.drawingBufferHeight;render()}
    const observer=new ResizeObserver(resize); observer.observe(container); const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)start();else stop()}); intersection.observe(container); document.addEventListener('visibilitychange',start); resize(); start()
    contexts.set(container,{program,render,setFps:(value)=>{fps=Math.min(Math.max(value,1),120)},setPaused:(value)=>{paused=value; if(value){stop();render()}else start()}})
    return ()=>{stop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',start);contexts.delete(container);if(canvas.parentNode===container)container.removeChild(canvas);gl.getExtension('WEBGL_lose_context')?.loseContext()}
  }, [dpr])
  useEffect(()=>{const context=contexts.get(containerRef.current);if(!context)return;const u=context.program.uniforms;setColor(u.uLineColor,lineColor);setColor(u.uGlowColor,glowColor);Object.assign({},u);u.uSpeed.value=speed;u.uScale.value=scale;u.uRotation.value=rotation;u.uRotationSpeed.value=rotationSpeed;u.uLayers.value=Math.min(Math.max(Math.round(layers),1),10);u.uWaveAmplitude.value=waveAmplitude;u.uWaveFrequency.value=waveFrequency;u.uWaveSpeed.value=waveSpeed;u.uLayerSpeed.value=layerSpeed;u.uTwist.value=twist;u.uTwistFrequency.value=twistFrequency;u.uTwistSpeed.value=twistSpeed;u.uLineFrequency.value=lineFrequency;u.uLineSpacing.value=lineSpacing;u.uLineSharpness.value=lineSharpness;u.uGlowFalloff.value=glowFalloff;u.uGlowIntensity.value=glowIntensity;u.uBrightness.value=brightness;u.uBlueBoost.value=blueBoost;u.uVignette.value=vignette;u.uGrain.value=grain;u.uLightMode.value=lightMode?1:0;context.setFps(fps);context.setPaused(paused);context.render()},[lineColor,glowColor,speed,scale,rotation,rotationSpeed,layers,waveAmplitude,waveFrequency,waveSpeed,layerSpeed,twist,twistFrequency,twistSpeed,lineFrequency,lineSpacing,lineSharpness,glowFalloff,glowIntensity,brightness,blueBoost,vignette,grain,lightMode,fps,paused])
  return <div ref={containerRef} className={`ghost-fibers-container ${className}`.trim()} />
}
