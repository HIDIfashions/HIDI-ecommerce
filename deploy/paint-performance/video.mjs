import {readFile,writeFile,unlink} from 'node:fs/promises';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function command(program,args,encoding='utf8'){const result=spawnSync(program,args,{encoding,maxBuffer:8*1024*1024});if(result.status!==0)throw Error(program+' failed: '+String(result.stderr).slice(-2000));return result;}
export async function encodeMobileVideo(base,overlay,manifest){
 const entries=Object.values(manifest.videos);if(entries.length!==1)throw Error('Expected one reviewed public hero video');
 const variant=entries[0].mobile;if(!/^\/media-performance\/assets\/[a-z0-9-]+\.mp4$/.test(variant.url))throw Error('Unexpected source');
 const source=join(base,'dist',variant.url),output=join(overlay,'dist/media-performance/assets/mobile-av1-build.mp4');
 command('ffmpeg',['-hide_banner','-nostdin','-y','-i',source,'-map','0:v:0','-map','0:a?','-c:v','libaom-av1','-crf','32','-b:v','0','-cpu-used','6','-row-mt','1','-threads','2','-fps_mode','passthrough','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',output]);
 const probe=file=>JSON.parse(command('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file]).stdout);
 const original=probe(source),encoded=probe(output),a=original.streams.find(s=>s.codec_type==='video'),b=encoded.streams.find(s=>s.codec_type==='video');
 if(b.codec_name!=='av1'||a.width!==b.width||a.height!==b.height||a.nb_read_frames!==b.nb_read_frames||Math.abs(Number(original.format.duration)-Number(encoded.format.duration))>.08)throw Error('Video dimensions, frames or duration changed');
 const audio=file=>command('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-c','copy','-f','data','-'],null).stdout;
 const originalAudio=audio(source),encodedAudio=audio(output);if(!originalAudio.equals(encodedAudio))throw Error('Audio bitstream changed');
 const quality=command('ffmpeg',['-hide_banner','-nostdin','-filter_complex_threads','1','-i',source,'-i',output,'-lavfi','[0:v]settb=AVTB,setpts=N/(24*TB)[a];[1:v]settb=AVTB,setpts=N/(24*TB)[b];[a][b]ssim','-an','-f','null','-']).stderr;
 const ssim=Number([...quality.matchAll(/All:([0-9.]+)/g)].at(-1)?.[1]);const input=await readFile(source),bytes=await readFile(output);
 if(!(ssim>=.985)||bytes.length>input.length*.8)throw Error('AV1 must preserve quality and save at least 20%: '+JSON.stringify({ssim,bytes:bytes.length,originalBytes:input.length}));
 const name='hero-av1-'+sha(bytes).slice(0,16)+'-1280.mp4';await writeFile(join(overlay,'dist/media-performance/assets',name),bytes);await unlink(output);
 variant.av1Url='/media-performance/assets/'+name;variant.av1Bytes=bytes.length;
 return {source:variant.url,url:variant.av1Url,originalBytes:input.length,bytes:bytes.length,ssim,width:b.width,height:b.height,frames:b.nb_read_frames,duration:encoded.format.duration,audioBitstreamIdentical:true,audioSha256:sha(encodedAudio),originalPreserved:true};
}
