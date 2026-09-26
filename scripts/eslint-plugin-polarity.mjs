const ADR = 'docs/adr/0001-comments-ban.md';

export default {
  rules: {
    'no-comments': {
      meta: {
        type: 'problem',
        docs: {
          description: `comments are banned in files this repo authors (${ADR})`,
        },
        messages: {
          banned: `Comments are banned in files this repo authors (${ADR}). Reasons go in ADRs or the PR body, edge cases in test names, history in commits and Linear, agent guidance in AGENTS.md.`,
        },
        schema: [],
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (comment.type === 'Shebang') continue;
              context.report({ loc: comment.loc, messageId: 'banned' });
            }
          },
        };
      },
    },
  },
};
