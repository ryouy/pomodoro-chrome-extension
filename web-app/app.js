const THEMES={
  alpine:['#2b77c5','#205f9d','#3a9b78','#eef5fd','#d6e3f2','#17324b','#627589'],
  forest:['#2f7c5d','#255f48','#5e8d35','#eef5ef','#d8e5db','#21382d','#69796e'],
  sunrise:['#d36c33','#ad5424','#4d8c73','#fff3eb','#f0dfd2','#44281c','#7f6c61'],
  twilight:['#5c64d6','#474fab','#418d88','#f0f1ff','#dee1f7','#232756','#6d7195'],
  sakura:['#c45f88','#9f476b','#56927d','#fff1f6','#f0dbe5','#4a2436','#7e6470']
};
const DEFAULTS={workMinutes:25,breakMinutes:5,totalSets:4,alarmSound:'classic',birdSound:'uguisu',theme:'alpine',soundEnabled:true,notificationsEnabled:false};
const $=id=>document.getElementById(id);
const els={timerView:$('timerView'),settingsView:$('settingsView'),settingsToggle:$('settingsToggle'),phaseLabel:$('phaseLabel'),setLabel:$('setLabel'),timeDisplay:$('timeDisplay'),start:$('startPauseButton'),reset:$('resetButton'),skip:$('skipButton'),form:$('settingsForm'),work:$('workMinutes'),break:$('breakMinutes'),sets:$('totalSets'),alarm:$('alarmSound'),bird:$('birdSound'),sound:$('soundEnabled'),notifications:$('notificationsEnabled'),testSound:$('testSound'),testBird:$('testBird')};

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};
let settings={...DEFAULTS,...read('pomodoro-settings',{})};
const initialTimer=()=>({status:'idle',phase:'work',currentSet:1,remainingSeconds:settings.workMinutes*60,endTime:null});
let timer={...initialTimer(),...read('pomodoro-timer',{})};
if(timer.status==='paused')timer.status='idle';
let showingSettings=false,advancing=false,audioContext;

function save(){localStorage.setItem('pomodoro-settings',JSON.stringify(settings));localStorage.setItem('pomodoro-timer',JSON.stringify(timer))}
function duration(phase=timer.phase){return (phase==='work'?settings.workMinutes:settings.breakMinutes)*60}
function remaining(){return timer.status==='running'&&timer.endTime?Math.max(0,Math.ceil((timer.endTime-Date.now())/1000)):Math.max(0,timer.remainingSeconds)}
function format(seconds){const value=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}
function applyTheme(name){const values=THEMES[name]||THEMES.alpine;['--accent','--dark','--break','--soft','--line','--ink','--muted'].forEach((key,index)=>document.documentElement.style.setProperty(key,values[index]));document.querySelector('meta[name="theme-color"]').content=values[0]}

function render(){
  const left=remaining();
  els.timeDisplay.textContent=format(left);els.phaseLabel.textContent=timer.phase==='work'?'作業':'休憩';els.setLabel.textContent=`${timer.currentSet} / ${settings.totalSets} セット`;
  els.start.textContent=timer.status==='running'?'計測中':timer.status==='complete'?'もう一度':'スタート';els.start.disabled=timer.status==='running';els.skip.disabled=timer.status==='complete';
  els.phaseLabel.classList.toggle('break',timer.phase==='break');
  document.title=`${format(left)} - ${timer.phase==='work'?'作業':'休憩'}`;
  if(timer.status==='running'&&left<=0&&!advancing){advancing=true;advance().finally(()=>advancing=false)}
}

function fillForm(){els.work.value=settings.workMinutes;els.break.value=settings.breakMinutes;els.sets.value=settings.totalSets;els.alarm.value=settings.alarmSound;els.bird.value=settings.birdSound;els.sound.checked=settings.soundEnabled;els.notifications.checked=settings.notificationsEnabled;document.querySelectorAll('[name="theme"]').forEach(input=>input.checked=input.value===settings.theme)}
function toggleSettings(show){showingSettings=show;els.timerView.hidden=show;els.settingsView.hidden=!show;els.settingsToggle.textContent=show?'← 戻る':'設定';if(show)fillForm()}

async function getAudio(){audioContext||=new AudioContext();if(audioContext.state==='suspended')await audioContext.resume();return audioContext}
function tone(context,{at=0,from,to=from,length=.15,type='sine',volume=.08}){const start=context.currentTime+.02+at,osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.setValueAtTime(from,start);osc.frequency.exponentialRampToValueAtTime(to,start+length);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.01);gain.gain.exponentialRampToValueAtTime(.0001,start+length);osc.connect(gain).connect(context.destination);osc.start(start);osc.stop(start+length+.02)}
async function playAlarm(id){const context=await getAudio(),patterns={classic:[[0,660,660,.16,'square'],[.22,660,660,.16,'square'],[.44,880,880,.28,'square']],digital:[[0,1046,1046,.09],[.13,1318,1318,.09],[.26,1567,1567,.09],[.39,1318,1318,.09]],gentle:[[0,523,523,.22],[.25,659,659,.22],[.5,784,784,.34]],bell:[[0,784,784,.7],[.28,1046,1046,.8]],crystal:[[0,988,988,.16],[.17,1318,1318,.16],[.34,1760,1760,.34]]};(patterns[id]||patterns.classic).forEach(([at,from,to,length,type])=>tone(context,{at,from,to,length,type,volume:.1}))}
async function playBird(id){const context=await getAudio(),patterns={uguisu:[[0,1850,1500,.15],[.22,1650,2600,.22],[.45,2550,2100,.12],[.59,2100,3050,.24]],robin:[[0,2200,3300,.1],[.12,3100,2450,.08],[.23,2500,3700,.13],[.38,3450,2800,.09],[.51,2050,3150,.11]],tit:[[0,3250,2700,.12],[.19,3250,2450,.12],[.44,3000,2700,.12],[.63,3000,2450,.12]],cuckoo:[[0,820,780,.25],[.29,650,620,.34],[.7,820,780,.25],[.99,650,620,.34]],sparrow:[[0,2800,4100,.08],[.1,3800,2750,.07],[.23,2800,4100,.08],[.35,3800,2750,.07],[.5,2800,4100,.08]]};(patterns[id]||patterns.uguisu).forEach(([at,from,to,length])=>tone(context,{at,from,to,length,volume:.07}))}
async function notify(title,body){if(!settings.notificationsEnabled||!('Notification'in window)||Notification.permission!=='granted')return;new Notification(title,{body,icon:'icon.svg'})}

async function announce(completedPhase,completedSet,isComplete){if(settings.soundEnabled){if(completedPhase==='work'&&!isComplete)await playBird(settings.birdSound);else await playAlarm(settings.alarmSound)}if(isComplete)notify('ポモドーロ完了',`${settings.totalSets}セット完了しました。`);else if(completedPhase==='work')notify('作業時間が終了しました',`セット ${completedSet}/${settings.totalSets} 完了。休憩を始めます。`);else notify('休憩が終了しました',`セット ${completedSet+1}/${settings.totalSets} の作業を始めます。`)}
async function advance(){const completedPhase=timer.phase,completedSet=timer.currentSet;let complete=false;if(completedSet>=settings.totalSets){complete=true;timer={status:'complete',phase:'work',currentSet:settings.totalSets,remainingSeconds:0,endTime:null}}else{const phase=completedPhase==='work'?'break':'work',currentSet=completedPhase==='work'?completedSet:completedSet+1,seconds=duration(phase);timer={status:'running',phase,currentSet,remainingSeconds:seconds,endTime:Date.now()+seconds*1000}}save();render();await announce(completedPhase,completedSet,complete)}

els.settingsToggle.addEventListener('click',()=>toggleSettings(!showingSettings));
els.start.addEventListener('click',async()=>{if(timer.status==='running')return;if(settings.soundEnabled)getAudio();if(timer.status==='complete')timer=initialTimer();const seconds=Math.max(1,timer.remainingSeconds||duration());timer={...timer,status:'running',remainingSeconds:seconds,endTime:Date.now()+seconds*1000};save();render()});
els.reset.addEventListener('click',()=>{timer=initialTimer();save();render()});
els.skip.addEventListener('click',()=>{if(timer.status!=='complete')advance()});
els.testSound.addEventListener('click',()=>playAlarm(els.alarm.value));els.testBird.addEventListener('click',()=>playBird(els.bird.value));
document.querySelectorAll('[name="theme"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)applyTheme(input.value)}));
document.querySelectorAll('.step-button').forEach(button=>button.addEventListener('click',()=>{const input=$(button.dataset.target),min=+input.min,max=+input.max,current=+input.value||min;input.value=Math.min(max,Math.max(min,current+(+button.dataset.delta)))}));
els.form.addEventListener('submit',async event=>{event.preventDefault();const previous=settings;settings={workMinutes:+els.work.value,breakMinutes:+els.break.value,totalSets:+els.sets.value,alarmSound:els.alarm.value,birdSound:els.bird.value,theme:document.querySelector('[name="theme"]:checked')?.value||'alpine',soundEnabled:els.sound.checked,notificationsEnabled:els.notifications.checked};if(settings.notificationsEnabled&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission();const durationChanged=settings.workMinutes!==previous.workMinutes||settings.breakMinutes!==previous.breakMinutes;timer=durationChanged?initialTimer():{...timer,currentSet:Math.min(timer.currentSet,settings.totalSets)};save();applyTheme(settings.theme);toggleSettings(false);render()});

applyTheme(settings.theme);fillForm();render();setInterval(render,250);
