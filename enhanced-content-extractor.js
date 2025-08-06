function filterMarkdown(markdown) {
  let content = markdown;

  // This is the boundary that separates content blocks we want to remove.
  // It looks for the start of a new major section (H1-H4 heading) or a horizontal rule.
  const sectionBoundary = '(?=\\n\\n#{1,4} |\\n\\n---\\n|\\n\\n\\*\\*\\*\\n|$)';

  const patterns = [
    // Recommendation sections (e.g., "Read More", "Related Articles")
    // Keywords are broad to catch variations.
    `\\n\\n(?:###?|\\*\\*)?\\s*(?:Read More|Also Read|Related Articles|Further Reading|More from [^\\n]+|Don't Miss|Up Next|Recommended|Trending|Popular|In Case You Missed It|You Might Also Like|Continue Reading|Related Stories|More Stories|Latest News|Editor's Picks|What to Read Next)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

    // Social media, newsletters, and other calls-to-action
    `\\n\\n(?:Share this article|Follow us on|Connect with us|Join our newsletter|Sign up for updates|Enter your email|Subscribe to our newsletter|Get the latest updates|Don't miss out)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

    // Comment sections
    `\\n\\n(?:###?|\\*\\*)?\\s*(?:Comments|Discussions|Leave a Reply|Add Your Comment|Reader Comments)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

    // Author biographies
    `\\n\\n(?:###?|\\*\\*)?\\s*(?:About the Author|Author Bio|By [^\\n]{5,50})\\s*[:]?\\s*\\n(?:[^\\n]+\\n){1,5}` + sectionBoundary,

    // Tags, categories, and other metadata lists
    `\\n\\n(?:###?|\\*\\*)?\\s*(?:Tags|Categories|Filed Under)\\s*[:]?\\s*\\n[\\s\\S]*?` + sectionBoundary,

    // Standalone lists of links (often navigation or related content not caught above)
    // This one does not use the sectionBoundary logic.
    `\\n(?:\\s*[-*]\\s*\\[[^\\]]+\\]\\([^)]+\\)\\s*){3,}\\n`,

    // Footers, copyright notices, and legal disclaimers. This is anchored to the end of the document.
    `\\n\\n(?:(?:\\*\\*Note\\*\\*|Disclaimer|Copyright|All rights reserved|Privacy Policy|Terms of Use)|(?:[^\\n]+ © \\d{4})|(?:© \\d{4} [^\\n]+))[\\s\\S]*?$`
  ];

  patterns.forEach(pattern => {
    content = content.replace(new RegExp(pattern, 'gi'), '\n\n');
  });

  // Final cleanup to normalize whitespace
  content = content.replace(/\n{3,}/g, '\n\n'); // Collapse excess newlines
  content = content.replace(/(\n\s*){2,}/g, '\n\n'); // Collapse newlines with only whitespace in them

  return content.trim() + '\n';
}