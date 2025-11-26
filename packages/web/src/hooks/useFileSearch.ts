/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

const BASE_URL = 'http://localhost:3000'; // Consider using environment variable

export interface FileInfo {
  path: string;
  name: string;
}

export function useFileSearch(sessionId: string | undefined) {
  const [searchResults, setSearchResults] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchFiles = useCallback(
    async (pattern: string) => {
      if (!sessionId || !pattern) {
        setSearchResults([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // 如果模式没有通配符，添加通配符以支持模糊匹配
        // 例如 "app" -> "**/*app*"
        let searchPattern = pattern;
        if (!pattern.includes('*')) {
          searchPattern = `**/*${pattern}*`;
        }

        const response = await fetch(`${BASE_URL}/api/files/glob`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            pattern: searchPattern,
            maxResults: 50, // Limit results for UI
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to search files');
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.files)) {
          const files = data.files.map((path: string) => ({
            path,
            name: path.split('/').pop() || path,
          }));
          setSearchResults(files);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Error searching files:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId],
  );

  return {
    searchResults,
    isLoading,
    error,
    searchFiles,
  };
}
