import {
  standardCatalog,
  type Catalog,
} from "@a2ui-sdk/react/0.8";
import A2UICitationCard from "./A2UICitationCard";
import A2UIRewriteDiff from "./A2UIRewriteDiff";
import A2UIStatsDashboard from "./A2UIStatsDashboard";

export const omeletteCatalog: Catalog = {
  ...standardCatalog,
  components: {
    ...standardCatalog.components,
    OmeletteCitationCard: A2UICitationCard,
    OmeletteRewriteDiff: A2UIRewriteDiff,
    OmeletteStatsDashboard: A2UIStatsDashboard,
  },
};
