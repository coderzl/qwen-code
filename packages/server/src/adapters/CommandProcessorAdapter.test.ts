/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandProcessorAdapter } from './CommandProcessorAdapter.js';
import type { Config } from '@qwen-code/qwen-code-core';

describe('CommandProcessorAdapter', () => {
  let adapter: CommandProcessorAdapter;
  let mockConfig: Config;

  beforeEach(() => {
    // Mock Config
    mockConfig = {
      getFileService: vi.fn(() => ({
        resolvePathSpec: vi.fn(async (pathSpec: string) => {
          // 模拟文件解析
          if (pathSpec === 'README.md') {
            return [{ path: 'README.md', size: 100 }];
          }
          if (pathSpec === 'src/*.ts') {
            return [
              { path: 'src/index.ts', size: 200 },
              { path: 'src/app.ts', size: 300 },
            ];
          }
          return [];
        }),
      })),
      getFileFilteringOptions: vi.fn(() => ({
        respectGitIgnore: true,
        respectQwenIgnore: true,
      })),
      getToolRegistry: vi.fn(() => ({
        getTool: vi.fn((name: string) => {
          if (name === 'read_many_files') {
            return {
              build: vi.fn((params: { paths: string[] }) => ({
                execute: vi.fn(async () => ({
                  llmContent: [
                    {
                      functionResponse: {
                        response: {
                          output: 'File content for ' + params.paths[0],
                        },
                      },
                    },
                  ],
                  returnDisplay: 'File content loaded',
                })),
                getDescription: vi.fn(() => 'Read files'),
                toolLocations: vi.fn(() => []),
                shouldConfirmExecute: vi.fn(async () => false),
              })),
            };
          }
          return null;
        }),
      })),
    } as unknown as Config;

    adapter = new CommandProcessorAdapter(mockConfig);
  });

  describe('parseAllAtCommands', () => {
    it('should parse single @ command', async () => {
      const result = await adapter.handleAtCommand('@README.md');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('README.md');
    });

    it('should parse multiple @ commands', async () => {
      const result = await adapter.handleAtCommand(
        '查看 @README.md 和 @src/*.ts',
      );
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should handle query without @ commands', async () => {
      const result = await adapter.handleAtCommand('Hello world');
      expect(result.files).toHaveLength(0);
      expect(result.processedQuery).toBe('Hello world');
    });

    it('should handle mixed text and @ commands', async () => {
      const result = await adapter.handleAtCommand('请分析 @README.md 的内容');
      expect(result.files).toHaveLength(1);
      expect(result.processedQuery).toContain('@README.md');
      expect(result.processedQuery).toContain('<files>');
    });
  });

  describe('handleAtCommand', () => {
    it('should process @ command and inject file content', async () => {
      const result = await adapter.handleAtCommand('@README.md');

      expect(result.shouldProceed).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('README.md');
      expect(result.files[0].size).toBe(100);
      expect(result.processedQuery).toContain('<files>');
      expect(result.processedQuery).toContain('README.md');
    });

    it('should handle wildcard paths', async () => {
      const result = await adapter.handleAtCommand('@src/*.ts');

      expect(result.files.length).toBeGreaterThanOrEqual(2);
      expect(result.processedQuery).toContain('<files>');
    });

    it('should return original query when no @ commands', async () => {
      const query = 'No at commands here';
      const result = await adapter.handleAtCommand(query);

      expect(result.processedQuery).toBe(query);
      expect(result.files).toHaveLength(0);
      expect(result.shouldProceed).toBe(true);
    });

    it('should handle error gracefully when file not found', async () => {
      // Mock resolvePathSpec to throw error
      const fileService = mockConfig.getFileService();
      if (fileService) {
        vi.mocked(fileService.resolvePathSpec).mockRejectedValue(
          new Error('File not found'),
        );
      }

      await expect(
        adapter.handleAtCommand('@nonexistent.txt'),
      ).rejects.toThrow();
    });
  });
});
