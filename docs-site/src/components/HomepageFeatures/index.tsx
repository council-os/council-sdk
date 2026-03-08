import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Do Things',
    description: (
      <>
        25 built-in connectors give agents real-world capabilities through a
        unified tool interface. Email, Slack, GitHub, Stripe, and more.
      </>
    ),
  },
  {
    title: 'Stay Safe',
    description: (
      <>
        Defense-in-depth Safety Lattice with emergency halts, fleet monitoring,
        containment cascades, and sub-millisecond runtime checks.
      </>
    ),
  },
  {
    title: 'Go Fast',
    description: (
      <>
        Rust safety monitors and Go gateway deliver sub-millisecond safety
        checks and 100K+ concurrent agents. The harness is invisible.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md padding-vert--lg">
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
          {FeatureList.map((props) => (
            <Feature key={props.title} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
