import Heading from '@theme/Heading';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const feature: FeatureItem =
{
  title: 'Powered by Flowerforce',
  Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
  description: (
    <>
      Powered by Flowerforce — a serverless-native platform for building and extending modern cloud applications with React and Docusaurus.
      Unlike traditional frameworks or visual builders, Flowerforce takes a developer-first approach — everything is code-driven, fully configurable, and designed for flexibility.
    </>
  ),
}

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          <Feature  {...feature} />
        </div>
      </div>
    </section>
  );
}
