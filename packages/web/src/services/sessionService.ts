/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastActivity: string;
  metadata?: Record<string, unknown>;
}

export interface SessionListResponse {
  sessions: SessionInfo[];
  total: number;
}

export interface SessionDetailResponse {
  id: string;
  userId: string;
  createdAt: string;
  lastActivity: string;
  duration: number;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface UpdateWorkspaceRequest {
  sessionId: string;
  workspaceRoot: string;
}

export interface UpdateWorkspaceResponse {
  success: boolean;
  sessionId: string;
  workspaceRoot: string;
}

export interface AddDirectoryRequest {
  sessionId: string;
  directories: string[];
}

export interface AddDirectoryResponse {
  success: boolean;
  added: string[];
  errors: string[];
}

export interface ListDirectoriesResponse {
  directories: string[];
}

/**
 * Session API服务
 */
export class SessionService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<SessionListResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * 获取会话详细信息
   */
  async getSession(sessionId: string): Promise<SessionDetailResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * 更新会话的workspaceRoot
   */
  async updateWorkspace(
    sessionId: string,
    workspaceRoot: string,
  ): Promise<UpdateWorkspaceResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/session/update-workspace`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, workspaceRoot }),
      },
    );

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * 添加目录到工作空间
   */
  async addDirectory(
    sessionId: string,
    directories: string[],
  ): Promise<AddDirectoryResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/add-directory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, directories }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * 获取工作空间的所有目录列表
   */
  async listDirectories(sessionId: string): Promise<ListDirectoriesResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/session/list-directories`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      },
    );

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }
}

// 在开发环境中，使用后端服务器地址
// 在生产环境中，baseUrl 应该由环境变量或配置提供
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // 开发环境：后端API地址跟随前端hostname
    // 例如：
    // - 前端 http://127.0.0.1:5173 -> 后端 http://127.0.0.1:3000
    // - 前端 http://localhost:5173 -> 后端 http://localhost:3000
    // - 前端 http://192.168.1.100:5173 -> 后端 http://192.168.1.100:3000
    return `http://${hostname}:3000`;
  }
  // 生产环境：使用相对路径（依赖代理或同域部署）
  return '';
};

export const sessionService = new SessionService(getBaseUrl());
