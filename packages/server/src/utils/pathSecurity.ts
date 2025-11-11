/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';

/**
 * 验证文件路径安全性，防止路径遍历攻击
 */
export function validateFilePath(
  requestedPath: string,
  workspaceRoot: string,
): boolean {
  try {
    // 规范化路径
    const normalizedPath = path.normalize(requestedPath);

    // 解析为绝对路径
    const absolutePath = path.resolve(workspaceRoot, normalizedPath);

    // 确保路径在workspace内
    return absolutePath.startsWith(workspaceRoot);
  } catch (_error) {
    return false;
  }
}

/**
 * 安全地连接路径
 */
export function safePathJoin(
  basePath: string,
  ...paths: string[]
): string | null {
  try {
    const joined = path.join(basePath, ...paths);
    const resolved = path.resolve(joined);

    if (!resolved.startsWith(basePath)) {
      return null;
    }

    return resolved;
  } catch (_error) {
    return null;
  }
}
