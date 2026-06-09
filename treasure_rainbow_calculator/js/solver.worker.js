// js/solver.worker.js — 在后台线程运行求解，避免阻塞 UI
import { solveExact } from './calculator.js';

self.onmessage = (e) => {
    const result = solveExact(e.data);
    // 用 transferable 转移大数组，零拷贝
    const transfer = [result.pT.buffer, result.pB.buffer, result.isUnknown.buffer];
    self.postMessage(result, transfer);
};
