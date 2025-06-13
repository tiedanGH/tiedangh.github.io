// 声音和音乐相关
export const bgmAudio = new Audio('https://assets.mixkit.co/music/preview/mixkit-game-show-suspense-waiting-668.mp3');
bgmAudio.loop = true; bgmAudio.volume = 0.2;

const clickSound     = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-quick-jump-arcade-game-239.mp3');
const bombSound      = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-arcade-game-explosion-2759.mp3');
const treasureSound  = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-unlock-game-notification-253.mp3');
const flagSound      = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-achievement-bell-600.mp3');
const winSound       = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-winning-chimes-2015.mp3');
const loseSound      = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-retro-arcade-lose-2027.mp3');
const lifeUpSound    = new Audio('https://assets.mixkit.co/active/sounds/preview/mixkit-extra-bonus-in-a-video-game-2045.mp3');

[ clickSound, bombSound, treasureSound, flagSound, winSound, loseSound, lifeUpSound ].forEach(s => s.volume = 0.3);

let sfxEnabled = true;

export function playSound(sound) {
    if (!sfxEnabled) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}

export function toggleBGM(btn) {
    if (bgmAudio.paused) {
        bgmAudio.play().catch(() => {});
        btn.textContent = '🎵 背景音乐: 开';
    } else {
        bgmAudio.pause();
        btn.textContent = '🎵 背景音乐: 关';
    }
}

export function toggleSFX(btn) {
    sfxEnabled = !sfxEnabled;
    btn.textContent = `🔊 音效: ${sfxEnabled ? '开' : '关'}`;
}

export {
    clickSound, bombSound, treasureSound,
    flagSound, winSound, loseSound, lifeUpSound
};
