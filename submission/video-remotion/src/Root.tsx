import React from 'react';
import {Composition} from 'remotion';
import {SiteForgeFilm, SF_DUR} from './showcase/SiteForgeFilm';
import {SiteForgeFilmV2, SF2_DUR} from './showcase/SiteForgeFilmV2';
import {SiteForgeFilmFinal, SFF_DUR} from './showcase/SiteForgeFilmFinal';

export const Root: React.FC = () => (
  <>
    <Composition id="siteforge-16x9" component={SiteForgeFilm} durationInFrames={SF_DUR} fps={30} width={1920} height={1080} />
    <Composition id="siteforge-16x9-v2" component={SiteForgeFilmV2} durationInFrames={SF2_DUR} fps={30} width={1920} height={1080} />
    <Composition id="siteforge-16x9-final" component={SiteForgeFilmFinal} durationInFrames={SFF_DUR} fps={30} width={1920} height={1080} />
  </>
);
