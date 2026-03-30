export type IssueType = 'bug' | 'feature' | 'tech-debt' | 'task';
export type IssueStatus = 'open' | 'in-progress' | 'blocked' | 'done';

export interface IssueFrontmatter {
  id: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: number;
  area: string;
  tags: string[];
}

export interface IssueDoc {
  relativePath: string;
  frontmatter: IssueFrontmatter;
  content: string;
}
