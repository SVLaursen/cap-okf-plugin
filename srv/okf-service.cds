// OkfService: the MCP tools channel (task 4.5, ADR-0010 Contract B). cap-okf adds this model to
// the app only when the tools channel is on (ADR-0005 (e)). Index-first: listing and searching
// return metadata only; a concept's text is one deliberate getConcept call.
//
// Every description is an @description, because MCP plugins take a tool's description from it
// and doc comments reach the model only when the app sets cdsc.docs (ADR-0010).

@okf: false
@mcp
@path: 'okf-service'
@description: 'The app''s knowledge as Open Knowledge Format concepts. Start with the Index, then read the concepts you need with getConcept.'
service OkfService {

  @readonly
  @cds.persistence.skip
  @description: 'The app''s knowledge index. Start here: one row per concept you may see, without its text. Read a concept''s full text with getConcept(path).'
  entity Index {
    key path        : String @description: 'The concept''s path in the bundle, e.g. model/sample/bookshop/Books.md.';
        type        : String @description: 'What kind of thing the concept describes, e.g. Entity, Service, Guide.';
        title       : String @description: 'The concept''s title.';
        description : String @description: 'One sentence about the concept.';
        tags        : String @description: 'The concept''s tags, comma-separated.';
        links       : String @description: 'Paths of the concepts it links to, comma-separated.';
  }

  @description: 'The full concept as Markdown with frontmatter. Take the path from Index or searchConcepts.'
  function getConcept(
    path : String not null @description: 'The concept''s path, e.g. model/sample/bookshop/Books.md.'
  ) returns LargeString;

  @description: 'Find concepts by words in their title, tags, description or path; optionally only of one type or with one tag. Returns Index rows (default 20, at most 100); read the ones you need with getConcept.'
  function searchConcepts(
    text : String  @description: 'Words to look for.',
    type : String  @description: 'Only concepts of this type, e.g. Entity.',
    tag  : String  @description: 'Only concepts with this tag.',
    top  : Integer @description: 'How many rows at most (default 20, at most 100).'
  ) returns many Index;

  @description: 'The bundle''s OKF version, a hash of its content and the namespace of its okf:// resources, to check whether a stored copy is stale.'
  function bundleInfo() returns {
    okfVersion : String @description: 'The OKF version the bundle follows, e.g. 0.2.';
    bundleHash : String @description: 'A hash of the bundle''s content: when it changes, re-read what you stored.';
    namespace  : String @description: 'The namespace of the bundle''s okf:// resources.';
  };
}
