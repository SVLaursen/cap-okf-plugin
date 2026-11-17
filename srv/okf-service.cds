// OkfService: the MCP tools channel (ADR-0010 Contract B, revised by ADR-0012). cap-okf adds
// this model to the app only when the tools channel is on (ADR-0005 (e)). Outline first: an
// agent reads the index, searches, then reads the notes it needs, one getConcept call each.
//
// The agent-facing tools are getIndex, searchConcepts and getConcept. Index and bundleInfo stay
// for code in the app (and for hosts that call the service in-process), marked @mcp: false so
// they aren't on the tool list.
//
// Every description is an @description, because MCP plugins take a tool's description from it
// and doc comments reach the model only when the app sets cdsc.docs (ADR-0010). They are written
// as instructions to an agent.

@okf: false
@mcp
@path: 'okf-service'
@description: 'This app''s business knowledge: what business terms and codes mean, how KPIs and figures are calculated, the rules and preconditions of actions, and fields that must not be used. Read getIndex first, then the notes you need with getConcept.'
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

  @description: 'Read this first. Returns the outline of the app''s business knowledge as Markdown: curated notes (meanings of terms and codes, KPI and calculation definitions, rules for actions, fields not to use) with title, path and description, and the generated model folded into one line. Read it before you filter on a code or status field, compute a named figure, or call an action.'
  function getIndex(
    folder : String @description: 'Optional: a folder to open its own index, e.g. model or model/CatalogService. Leave it out for the outline.'
  ) returns LargeString;

  @description: 'Reads one knowledge note or model concept in full, as Markdown, followed by the related notes it links to. Take the path from getIndex or searchConcepts. Read the matching note before you filter on a code or status field, compute a figure the business has a name for, or call an action: it says what values mean and which fields must not be used.'
  function getConcept(
    path : String not null @description: 'The path from getIndex or searchConcepts, e.g. guides/ordering.md.'
  ) returns LargeString;

  @description: 'Finds knowledge notes and model concepts by any of your words, in titles, tags, synonyms, descriptions and text. Use it when a question names a business term, code, status value or KPI you don''t know. Returns paths with title and description, best first; read them with getConcept. If no word is found, you get the outline of curated notes (matched = false).'
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
