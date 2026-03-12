import {
  standardCatalog,
  type Catalog,
  type CatalogComponent,
} from "@a2ui-sdk/react/0.8";
import A2UICitationCard from "./A2UICitationCard";
import A2UIRewriteDiff from "./A2UIRewriteDiff";
import A2UIStatsDashboard from "./A2UIStatsDashboard";

// A2UI framework injects component-specific props from the surface definition
// at runtime, so catalog entries are safely cast to CatalogComponent.
export const omeletteCatalog: Catalog = {
  ...standardCatalog,
  components: {
    ...standardCatalog.components,
    OmeletteCitationCard: A2UICitationCard as unknown as CatalogComponent,
    OmeletteRewriteDiff: A2UIRewriteDiff as unknown as CatalogComponent,
    OmeletteStatsDashboard: A2UIStatsDashboard as unknown as CatalogComponent,
  },
};
