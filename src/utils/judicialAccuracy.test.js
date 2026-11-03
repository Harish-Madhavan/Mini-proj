import { describe, it, expect } from 'vitest';
import { JUDICIAL_GROUND_TRUTH, queryJudicialGroundTruth } from '../data/judicialCorpus';
import { tagKnownEntity } from './knownEntities';

describe('judicialAccuracy & open ground-truth benchmarks', () => {
  it('correctly maps certified court dockets to known judicial cases', () => {
    expect(JUDICIAL_GROUND_TRUTH.length).toBeGreaterThanOrEqual(5);

    // Colonial Pipeline
    const colonial = queryJudicialGroundTruth('7acfa96e54f73abdafbfa241ec7e8d42d3869b3597d620584749f1db7eead98b');
    expect(colonial).not.toBeNull();
    expect(colonial.caseEntry.docketNumber).toBe('D.D.C. 1:21-mj-00473');
    expect(colonial.caseEntry.investigatingAgency).toContain('FBI');

    // Silk Road Individual X
    const silkRoad = queryJudicialGroundTruth('1HQ3Go3ggs8pFnXuHVHRytPCq5fGG8Hbhx');
    expect(silkRoad).not.toBeNull();
    expect(silkRoad.caseEntry.docketNumber).toBe('N.D. Cal. 3:20-cv-07811');
  });

  it('does not infer judicial or sanctions attribution from address prefixes', () => {
    // These fixtures share only a short prefix with the local reference entries.
    const usms = tagKnownEntity('bc1qa5wkhsye2vftene9965ngxtxtjaentrpucexdw');
    expect(usms).toBeNull();

    // FBI Colonial Pipeline seizure wallet
    const fbi = tagKnownEntity('bc1qq468y0e854u0m68g0e2u389j5e09u2k468y0e8');
    expect(fbi).toBeNull();

    // DOJ Bitfinex Recovery Vault
    const doj = tagKnownEntity('bc1qmxay474w657h78r8574w657h78r8574w657h78');
    expect(doj).toBeNull();
  });

  it('does not identify OFAC entities from short address prefixes', () => {
    const garantex = tagKnownEntity('1L26z9842109876543210987654321098765');
    expect(garantex).toBeNull();

    // Sinbad.io Mixer
    const sinbad = tagKnownEntity('bc1qz9842109876543210987654321098765');
    expect(sinbad).toBeNull();

    // Blender.io
    const blender = tagKnownEntity('1BtcB9842109876543210987654321098765');
    expect(blender).toBeNull();
  });

  it('identifies verified exchange cold/hot vaults with proof-of-reserves provenance', () => {
    // Binance Cold Storage #1
    const binance = tagKnownEntity('34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo');
    expect(binance).not.toBeNull();
    expect(binance.category).toBe('exchange');
    expect(binance.risk).toBe('low');
    expect(binance.provenance).toContain('Proof-of-Reserves');

    // Kraken Cold Storage
    const kraken = tagKnownEntity('bc1qa2dn50l6k0m2m3wdf3c08z6gq2fsmrwhj5v6d7');
    expect(kraken).not.toBeNull();
    expect(kraken.category).toBe('exchange');
    expect(kraken.provenance).toContain('Kraken Merkle');
  });

  it('demonstrates zero false-accusation rate across all judicial ground-truth outputs', () => {
    // False accusation = classifying a legitimate seizure or change output as a criminal payment/sanctioned counterparty
    let falseAccusations = 0;
    let totalChecked = 0;

    for (const caseEntry of JUDICIAL_GROUND_TRUTH) {
      for (const out of caseEntry.groundTruthOutputs) {
        totalChecked++;
        const entityTag = tagKnownEntity(out.address);
        // If it's a government seizure vault, it MUST NOT be tagged as sanctioned or darknet
        if (out.isSeizure && entityTag && (entityTag.category === 'sanctioned' || entityTag.category === 'darknet')) {
          falseAccusations++;
        }
      }
    }

    expect(totalChecked).toBeGreaterThanOrEqual(7);
    expect(falseAccusations).toBe(0);
  });
});
