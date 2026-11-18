// OkfService: the MCP tools channel (ADR-0010 Contract B, revised by ADR-0012 and ADR-0013).
// cap-okf adds this model to the app only when the tools channel is on (ADR-0005 (e)). Outline
// first: an agent reads the index, searches, then reads the notes it needs, up to five a call.
//
// The agent-facing tools are getIndex, searchConcepts and getConcept. Index and bundleInfo stay
// for code in the app (and for hosts that call the service in-process), marked @mcp: false so
// they aren't on the tool list.
//
// Every description is an @description, because MCP plugins take a tool's description from it
// and doc comments reach the model only when the app sets cdsc.docs (ADR-0010). They are
// neutral: they say what each tool returns. When to read (the directive part) is added per
// caller, only for callers who see curated notes (src/serve/mcp/tool-texts.ts, ADR-0013).

@okf: false
@mcp
@path: 'okf-service'
@description: 'This app''s knowledge bundle (OKF): curated notes and generated model concepts, as Markdown.'
service OkfService {

  @readonly
  @cds.persistence.skip
  @mcp: false
  @description: 'The app''s knowledge index: one row per concept you may see, without its text. Read a concept''s full text with getConcept(path).'
  entity Index {
    key path        : String @description: 'The concept''s path in the bundle, e.g. model/sample/bookshop/Books.md.';
        type        : String @description: 'What kind of thing the concept describes, e.g. Entity, Service, Guide.';
        title       : String @description: 'The concept''s title.';
        description : String @description: 'One sentence about the concept.';
        tags        : String @description: 'The concept''s tags, comma-separated.';
        links       : String @description: 'Paths of the concepts it links to, comma-separated.';
  }

  /** One search result: enough to choose what to read. */
  type ConceptSummary {
    path        : String  @description: 'The path to read with getConcept.';
    type        : String  @description: 'What kind of thing it describes, e.g. Guide, Entity.';
    title       : String  @description: 'Its title.';
    description : String  @description: 'One sentence about it.';
    tags        : String  @description: 'Its tags, comma-separated.';
    matched     : Boolean @description: 'False when none of your words was found and this is the outline of curated notes instead.';
  }

  @description: 'Returns the outline of this app''s business knowledge as Markdown: curated notes with title, path and description, then the model in one line.'
  function getIndex(
    folder : String @description: 'Optional: a folder to open its own index, e.g. model or model/CatalogService. Leave it out for the outline.'
  ) returns LargeString;

  @description: 'Returns notes or model concepts in full, as Markdown: path for one, or up to 5 paths at once, each under a line with its path. Paths come from getIndex or searchConcepts.'
  function getConcept(
    path  : String      @description: 'One path from getIndex or searchConcepts, e.g. guides/ordering.md.',
    paths : many String @description: 'Up to 5 paths to read in one call, e.g. a note and the notes it says to read together with it.'
  ) returns LargeString;

  @description: 'Finds notes and model concepts by any of your words, in titles, tags, synonyms, descriptions and text. Returns paths with title and description, best first. If no word is found, returns the outline of curated notes (matched = false).'
  function searchConcepts(
    text : String  @description: 'Words to look for, e.g. a business term, code or KPI name.',
    type : String  @description: 'Only concepts of this type, e.g. Guide or Entity.',
    tag  : String  @description: 'Only concepts with this tag.',
    top  : Integer @description: 'How many results at most (default 20, at most 100).'
  ) returns many ConceptSummary;

  @mcp: false
  @description: 'The bundle''s OKF version, a hash of its content and the namespace of its okf:// resources, to check whether a stored copy is stale.'
  function bundleInfo() returns {
    okfVersion : String @description: 'The OKF version the bundle follows, e.g. 0.2.';
    bundleHash : String @description: 'A hash of the bundle''s content: when it changes, re-read what you stored.';
    namespace  : String @description: 'The namespace of the bundle''s okf:// resources.';
  };
}
