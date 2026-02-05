import type { ScheduleTemplate } from '@accomplish/shared';

/**
 * Curated schedule templates organized by category
 * Each template includes a pre-written prompt and suggested schedule
 */
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  // ============================================
  // DEVELOPER TEMPLATES
  // ============================================
  {
    id: 'dev-pr-review',
    name: 'Daily PR Review',
    description: 'Review open pull requests and summarize changes',
    category: 'developer',
    icon: 'GitPullRequest',
    prompt:
      'Review all open pull requests in the current repository. For each PR, summarize the changes, identify potential issues or concerns, and provide a brief recommendation (approve, request changes, or needs discussion).',
    suggestedCron: '0 9 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['git', 'code-review', 'pull-request'],
  },
  {
    id: 'dev-dependency-audit',
    name: 'Dependency Audit',
    description: 'Check for outdated or vulnerable dependencies',
    category: 'developer',
    icon: 'Package',
    prompt:
      'Audit the project dependencies for security vulnerabilities and outdated packages. List any critical or high severity issues, check for major version updates available, and create a prioritized upgrade plan with potential breaking changes to watch for.',
    suggestedCron: '0 10 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['security', 'dependencies', 'npm', 'packages'],
  },
  {
    id: 'dev-changelog',
    name: 'Changelog Generator',
    description: 'Generate changelog from recent commits',
    category: 'developer',
    icon: 'FileText',
    prompt:
      'Generate a changelog entry from all commits since the last release or tag. Group changes by type (features, bug fixes, breaking changes, documentation). Use conventional commit messages to categorize. Format in markdown ready for CHANGELOG.md.',
    suggestedCron: '0 17 * * 5',
    suggestedFrequency: 'weekly',
    tags: ['git', 'changelog', 'release', 'documentation'],
  },
  {
    id: 'dev-code-health',
    name: 'Code Health Report',
    description: 'Analyze code quality and technical debt',
    category: 'developer',
    icon: 'HeartPulse',
    prompt:
      'Analyze the codebase for code health metrics. Identify areas with high complexity, duplicated code, missing tests, and potential technical debt. Provide a prioritized list of refactoring opportunities with estimated impact and effort.',
    suggestedCron: '0 9 1 * *',
    suggestedFrequency: 'monthly',
    tags: ['quality', 'refactoring', 'technical-debt'],
  },
  {
    id: 'dev-docs-sync',
    name: 'Documentation Sync',
    description: 'Check if docs match the current codebase',
    category: 'developer',
    icon: 'BookCheck',
    prompt:
      'Compare the README and documentation files against the current codebase. Identify outdated information, missing documentation for new features, and inconsistencies between docs and actual behavior. List specific sections that need updates.',
    suggestedCron: '0 14 * * 3',
    suggestedFrequency: 'weekly',
    tags: ['documentation', 'readme', 'maintenance'],
  },

  // ============================================
  // PRODUCTIVITY TEMPLATES
  // ============================================
  {
    id: 'prod-standup',
    name: 'Daily Standup Prep',
    description: 'Summarize yesterday\'s work and today\'s priorities',
    category: 'productivity',
    icon: 'ListChecks',
    prompt:
      'Prepare my daily standup by: 1) Summarizing my git commits and activity from yesterday, 2) Listing any blockers or issues encountered, 3) Suggesting priorities for today based on open tasks and deadlines. Format as bullet points ready for standup.',
    suggestedCron: '0 8 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['standup', 'daily', 'agile', 'scrum'],
  },
  {
    id: 'prod-weekly-report',
    name: 'Weekly Report Draft',
    description: 'Compile accomplishments from the week',
    category: 'productivity',
    icon: 'ClipboardList',
    prompt:
      'Generate a weekly status report summarizing: 1) Key accomplishments and completed tasks, 2) Progress on ongoing projects with percentage estimates, 3) Challenges faced and how they were resolved, 4) Plans and goals for next week. Format professionally for sharing with stakeholders.',
    suggestedCron: '0 16 * * 5',
    suggestedFrequency: 'weekly',
    tags: ['report', 'weekly', 'status', 'summary'],
  },
  {
    id: 'prod-meeting-prep',
    name: 'Meeting Prep Assistant',
    description: 'Prepare agenda and action items for recurring meetings',
    category: 'productivity',
    icon: 'Calendar',
    prompt:
      'Prepare for the upcoming team meeting by: 1) Creating an agenda based on recent project activity, 2) Listing open action items from previous meetings, 3) Identifying topics that need discussion, 4) Preparing any metrics or data points to share.',
    suggestedCron: '0 8 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['meeting', 'agenda', 'preparation'],
  },
  {
    id: 'prod-project-status',
    name: 'Project Status Update',
    description: 'Generate project status from recent activity',
    category: 'productivity',
    icon: 'TrendingUp',
    prompt:
      'Generate a project status update including: 1) Overall health assessment (on track, at risk, blocked), 2) Recent milestones achieved, 3) Current sprint or phase progress, 4) Upcoming deadlines and deliverables, 5) Resource or dependency concerns.',
    suggestedCron: '0 9 * * 3',
    suggestedFrequency: 'weekly',
    tags: ['project', 'status', 'management'],
  },
  {
    id: 'prod-end-of-day',
    name: 'End of Day Summary',
    description: 'Summarize daily progress and plan tomorrow',
    category: 'productivity',
    icon: 'Sunset',
    prompt:
      'Create an end-of-day summary: 1) What I accomplished today, 2) What I learned or discovered, 3) What got blocked or delayed, 4) Top 3 priorities for tomorrow, 5) Any notes or reminders for future me.',
    suggestedCron: '0 17 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['daily', 'summary', 'planning'],
  },

  // ============================================
  // MONITORING TEMPLATES
  // ============================================
  {
    id: 'mon-competitor',
    name: 'Competitor Watch',
    description: 'Monitor competitor news and updates',
    category: 'monitoring',
    icon: 'Eye',
    prompt:
      'Search for recent news, blog posts, product updates, and social media activity about competitors in my industry. Summarize key announcements, new features, pricing changes, and strategic moves. Highlight anything that might impact our product or strategy.',
    suggestedCron: '0 9 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['competitor', 'market', 'research', 'news'],
  },
  {
    id: 'mon-api-health',
    name: 'API Health Check',
    description: 'Test critical endpoints and report failures',
    category: 'monitoring',
    icon: 'Activity',
    prompt:
      'Perform a health check on the application: 1) Check if the main entry points are responding, 2) Verify any API endpoints return expected responses, 3) Check for any error patterns in recent logs, 4) Report any anomalies or degraded performance.',
    suggestedCron: '0 */6 * * *',
    suggestedFrequency: 'hourly',
    tags: ['api', 'health', 'monitoring', 'uptime'],
  },
  {
    id: 'mon-logs',
    name: 'Log Analysis',
    description: 'Review logs for errors and unusual patterns',
    category: 'monitoring',
    icon: 'FileSearch',
    prompt:
      'Analyze recent application logs looking for: 1) Error messages and stack traces, 2) Warning patterns that might indicate problems, 3) Unusual spikes in activity or response times, 4) Any security-related events. Summarize findings with severity levels.',
    suggestedCron: '0 8 * * *',
    suggestedFrequency: 'daily',
    tags: ['logs', 'errors', 'debugging', 'analysis'],
  },
  {
    id: 'mon-security-news',
    name: 'Security News Digest',
    description: 'Summarize relevant security advisories',
    category: 'monitoring',
    icon: 'Shield',
    prompt:
      'Compile a security digest relevant to my tech stack: 1) New CVEs affecting my dependencies, 2) Security advisories from major vendors, 3) Emerging threat patterns or attack vectors, 4) Best practice updates and security recommendations.',
    suggestedCron: '0 9 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['security', 'cve', 'vulnerabilities', 'advisories'],
  },
  {
    id: 'mon-performance',
    name: 'Performance Baseline',
    description: 'Run benchmarks and compare to historical data',
    category: 'monitoring',
    icon: 'Gauge',
    prompt:
      'Assess current application performance: 1) Check build times and compare to previous builds, 2) Analyze bundle sizes and identify bloat, 3) Review any available performance metrics, 4) Flag any significant regressions from baseline.',
    suggestedCron: '0 6 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['performance', 'benchmark', 'metrics'],
  },

  // ============================================
  // LEARNING TEMPLATES
  // ============================================
  {
    id: 'learn-tech-brief',
    name: 'Daily Tech Brief',
    description: 'Discover and summarize interesting tech articles',
    category: 'learning',
    icon: 'Newspaper',
    prompt:
      'Find and summarize one interesting recent article or development in software engineering, focusing on practical applications. Include: 1) The key insight or innovation, 2) Why it matters, 3) How I might apply it to my work, 4) Links or resources for deeper learning.',
    suggestedCron: '0 12 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['learning', 'news', 'articles', 'tech'],
  },
  {
    id: 'learn-concept',
    name: 'Concept Deep Dive',
    description: 'Learn a new advanced concept in depth',
    category: 'learning',
    icon: 'GraduationCap',
    prompt:
      'Select an advanced programming concept I might not be fully utilizing and explain it in depth. Include: 1) What the concept is and why it matters, 2) Practical examples and use cases, 3) Common pitfalls to avoid, 4) A small coding exercise to practice.',
    suggestedCron: '0 10 * * 3',
    suggestedFrequency: 'weekly',
    tags: ['learning', 'concept', 'education', 'deep-dive'],
  },
  {
    id: 'learn-kata',
    name: 'Code Kata Selector',
    description: 'Select a coding challenge to practice skills',
    category: 'learning',
    icon: 'Dumbbell',
    prompt:
      'Suggest a coding kata or challenge for today\'s practice. Consider: 1) A specific algorithm or data structure to practice, 2) The problem statement and constraints, 3) Hints for approaching the solution, 4) Follow-up challenges to increase difficulty.',
    suggestedCron: '0 7 * * 1-5',
    suggestedFrequency: 'weekly',
    tags: ['kata', 'practice', 'algorithm', 'challenge'],
  },
  {
    id: 'learn-docs-explorer',
    name: 'Documentation Explorer',
    description: 'Discover underused features in your tools',
    category: 'learning',
    icon: 'Compass',
    prompt:
      'Find an underused or lesser-known feature in a tool or framework I use regularly. Explain: 1) What the feature does, 2) Practical scenarios where it\'s useful, 3) How to use it with code examples, 4) Any gotchas or limitations.',
    suggestedCron: '0 14 * * 2',
    suggestedFrequency: 'weekly',
    tags: ['documentation', 'features', 'tools', 'discovery'],
  },
  {
    id: 'learn-trends',
    name: 'Industry Trends',
    description: 'Summarize trending topics in tech',
    category: 'learning',
    icon: 'TrendingUp',
    prompt:
      'Summarize the top trending topics in software development from the past week. Include: 1) New tools or frameworks gaining traction, 2) Industry discussions and debates, 3) Notable open source releases, 4) Emerging patterns or practices.',
    suggestedCron: '0 9 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['trends', 'industry', 'news', 'updates'],
  },

  // ============================================
  // CREATIVE TEMPLATES
  // ============================================
  {
    id: 'creative-project-ideas',
    name: 'Side Project Ideas',
    description: 'Generate creative project ideas to explore',
    category: 'creative',
    icon: 'Lightbulb',
    prompt:
      'Generate 3 creative side project ideas that would be fun to build and help me learn new skills. For each idea include: 1) The project concept and target users, 2) Key features and scope, 3) Technologies I could learn or practice, 4) Potential challenges and how to approach them.',
    suggestedCron: '0 15 * * 5',
    suggestedFrequency: 'weekly',
    tags: ['ideas', 'projects', 'creativity', 'learning'],
  },
  {
    id: 'creative-ui-inspiration',
    name: 'UI/UX Inspiration',
    description: 'Find innovative UI patterns and ideas',
    category: 'creative',
    icon: 'Palette',
    prompt:
      'Find innovative UI/UX patterns or design approaches that could enhance user experience. Describe: 1) The design pattern or interaction, 2) Why it\'s effective from a UX perspective, 3) How it could be implemented technically, 4) Examples of apps or sites using it well.',
    suggestedCron: '0 14 * * 4',
    suggestedFrequency: 'weekly',
    tags: ['ui', 'ux', 'design', 'inspiration'],
  },
  {
    id: 'creative-blog-prompt',
    name: 'Blog Post Outline',
    description: 'Generate technical blog post ideas and outlines',
    category: 'creative',
    icon: 'PenTool',
    prompt:
      'Generate a technical blog post outline based on my recent work or learnings. Include: 1) A compelling title and hook, 2) The target audience and what they\'ll learn, 3) Section outline with key points, 4) Code examples or diagrams to include, 5) Call to action or discussion questions.',
    suggestedCron: '0 10 * * 5',
    suggestedFrequency: 'weekly',
    tags: ['writing', 'blog', 'content', 'technical'],
  },
  {
    id: 'creative-refactor',
    name: 'Refactoring Ideas',
    description: 'Suggest creative ways to improve code elegance',
    category: 'creative',
    icon: 'Wand2',
    prompt:
      'Look at recent code changes and suggest creative refactoring opportunities. Focus on: 1) Simplifying complex logic, 2) Improving naming and readability, 3) Applying design patterns appropriately, 4) Reducing duplication elegantly. Provide before/after examples.',
    suggestedCron: '0 15 * * 3',
    suggestedFrequency: 'weekly',
    tags: ['refactoring', 'code-quality', 'patterns'],
  },
  {
    id: 'creative-architecture',
    name: 'Architecture Exploration',
    description: 'Explore alternative architectural approaches',
    category: 'creative',
    icon: 'Building2',
    prompt:
      'Propose alternative architecture patterns or approaches for a component of the current project. Consider: 1) Current architecture and its trade-offs, 2) Alternative approaches with their benefits, 3) Migration path if we wanted to change, 4) When each approach is most appropriate.',
    suggestedCron: '0 11 * * 4',
    suggestedFrequency: 'weekly',
    tags: ['architecture', 'design', 'patterns', 'exploration'],
  },

  // ============================================
  // MAINTENANCE TEMPLATES
  // ============================================
  {
    id: 'maint-cleanup',
    name: 'Cleanup Reminder',
    description: 'List files and branches to clean up',
    category: 'maintenance',
    icon: 'Trash2',
    prompt:
      'Identify cleanup opportunities in the repository: 1) Stale branches that can be deleted (merged or abandoned), 2) Unused files or dead code, 3) Large files that shouldn\'t be in version control, 4) Temporary or generated files that weren\'t gitignored. Provide safe deletion commands.',
    suggestedCron: '0 10 * * 0',
    suggestedFrequency: 'weekly',
    tags: ['cleanup', 'git', 'maintenance', 'branches'],
  },
  {
    id: 'maint-backup',
    name: 'Backup Verification',
    description: 'Verify backups exist and are restorable',
    category: 'maintenance',
    icon: 'HardDrive',
    prompt:
      'Perform a backup verification check: 1) Confirm recent backups exist for critical data, 2) Check backup file integrity and sizes, 3) Verify backup retention policy is being followed, 4) Document any gaps or issues that need attention.',
    suggestedCron: '0 2 * * 0',
    suggestedFrequency: 'weekly',
    tags: ['backup', 'verification', 'data', 'disaster-recovery'],
  },
  {
    id: 'maint-license',
    name: 'License Audit',
    description: 'Check dependencies for license compliance',
    category: 'maintenance',
    icon: 'Scale',
    prompt:
      'Audit all project dependencies for license compliance: 1) List all dependency licenses, 2) Flag any copyleft or restrictive licenses, 3) Identify any licenses incompatible with our project license, 4) Check for dependencies with unclear licensing.',
    suggestedCron: '0 9 1 * *',
    suggestedFrequency: 'monthly',
    tags: ['license', 'compliance', 'legal', 'dependencies'],
  },
  {
    id: 'maint-todo-hunter',
    name: 'TODO Hunter',
    description: 'Find and prioritize TODO comments in code',
    category: 'maintenance',
    icon: 'Search',
    prompt:
      'Hunt for TODO, FIXME, HACK, and XXX comments throughout the codebase. For each: 1) Location and context, 2) Estimated age (from git blame), 3) Suggested priority based on impact, 4) Whether it\'s still relevant. Create a prioritized backlog of items to address.',
    suggestedCron: '0 9 15 * *',
    suggestedFrequency: 'monthly',
    tags: ['todo', 'fixme', 'technical-debt', 'backlog'],
  },
  {
    id: 'maint-env-sync',
    name: 'Environment Sync Check',
    description: 'Compare configs across environments',
    category: 'maintenance',
    icon: 'RefreshCw',
    prompt:
      'Check for configuration drift between environments: 1) Compare environment variable definitions, 2) Check for config values that differ unexpectedly, 3) Identify missing or extra configurations, 4) Flag any security-sensitive differences. Report discrepancies that need investigation.',
    suggestedCron: '0 6 * * 1',
    suggestedFrequency: 'weekly',
    tags: ['environment', 'config', 'sync', 'devops'],
  },
];

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: ScheduleTemplate['category']): ScheduleTemplate[] {
  return SCHEDULE_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): ScheduleTemplate | undefined {
  return SCHEDULE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Search templates by query string (matches name, description, and tags)
 */
export function searchTemplates(query: string): ScheduleTemplate[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return SCHEDULE_TEMPLATES;
  }

  return SCHEDULE_TEMPLATES.filter((t) => {
    return (
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  });
}
