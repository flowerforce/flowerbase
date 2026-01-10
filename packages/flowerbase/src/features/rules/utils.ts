import fs from 'fs'
import path from 'node:path'
import { readJsonContent } from '../../utils'
import { Rules, RulesConfig } from './interface'

export const loadRules = async (rootDir = process.cwd()): Promise<Rules> => {
  const rulesRoot = path.join(rootDir, 'data_sources', 'mongodb-atlas')
  const recursivelyCollectFiles = (dir: string): string[] => {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return recursivelyCollectFiles(fullPath)
      }
      return entry.isFile() ? [fullPath] : []
    })
  }
  const files = recursivelyCollectFiles(rulesRoot)
  const rulesFiles = files.filter((x) => (x as string).endsWith('rules.json'))

  const rulesByCollection = rulesFiles.reduce((acc, rulesFile) => {
    const filePath = rulesFile
    const collectionRules = readJsonContent(filePath) as RulesConfig
    acc[collectionRules.collection] = collectionRules

    return acc
  }, {} as Rules)

  return rulesByCollection
}

// export const getNestedPipelines = (pipeline: AggregationPipelineStage[]) => {
//   return pipeline.reduce(
//     (acc, stage) => {
//       const [stageKey] = Object.keys(stage);
//       const stageValue = stage[stageKey as keyof typeof stage];
//       const pipeline = stageValue?.["pipeline"]

//       if (stageKey === '$lookup') {
//         acc.pipelines.push(stageValue);
//         if (pipeline) {
//           const { collections, pipelines } = getNestedPipelines(pipeline);
//           acc.collections.push(...new Set([(stageValue as LookupStage).from, ...collections]));
//           acc.pipelines.push(...pipelines);
//         }
//       }

//       if (stageKey === '$facet') {
//         for (const subPipeline of Object.values(stageValue)) {
//           const { collections, pipelines } = getNestedPipelines(subPipeline as AggregationPipelineStage[]);
//           acc.collections.push(...collections);
//           acc.pipelines.push(...pipelines);
//         }
//       }

//       if (
//         stageKey === '$unionWith' &&
//         typeof stageValue === 'object' &&
//         pipeline
//       ) {
//         const { collections, pipelines } = getNestedPipelines(pipeline);
//         acc.collections.push(...new Set([(stageValue as UnionWithStage).coll, ...collections]));
//         acc.pipelines.push(...pipelines);
//       }

//       return acc;
//     },
//     {
//       collections: [],
//       pipelines: [],
//     } as {
//       collections: string[],
//       pipelines: AggregationPipelineStage[]
//     }
//   );
// }
