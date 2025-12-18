
const bgmAudio = new Audio('audio/bgm.mp3');
bgmAudio.loop = true; bgmAudio.volume = 0.2;

const bombSound      = new Audio('audio/bomb.mp3');
const treasureSound  = new Audio('audio/treasure.mp3');
const flagSound      = new Audio('audio/flag.mp3');
const winSound       = new Audio('audio/win.mp3');
const loseSound      = new Audio('audio/lose.mp3');
const lifeUpSound    = new Audio('audio/life_up.mp3');

[ bombSound, treasureSound, flagSound, winSound, loseSound, lifeUpSound ].forEach(s => s.volume = 0.3);

let bgmEnabled = false;
let sfxEnabled = true;

function playSound(sound) {
    if (!sfxEnabled) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}

function toggleBGM(btn) {
    if (!bgmEnabled) {
        bgmAudio.play().catch(() => {});
        bgmEnabled = true;
        btn.textContent = '🎵 背景音乐: 开';
    } else {
        bgmAudio.pause();
        bgmEnabled = false;
        btn.textContent = '🎵 背景音乐: 关';
    }
}

function toggleSFX(btn) {
    sfxEnabled = !sfxEnabled;
    btn.textContent = `🔊 音效: ${sfxEnabled ? '开' : '关'}`;
}
