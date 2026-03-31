import { Injectable } from '@nestjs/common';

export interface RecommendedSong {
  title: string;
  artist: string;
  is_new: boolean;
}

@Injectable()
export class DataEngineService {
  async getRecommendations(eventDescription: string): Promise<RecommendedSong[]> {
    // Mock response — will be replaced with HTTP call to data-engine POST /recommend
    return [
      { title: 'Bohemian Rhapsody', artist: 'Queen', is_new: false },
      { title: 'Stairway to Heaven', artist: 'Led Zeppelin', is_new: false },
      { title: 'Hotel California', artist: 'Eagles', is_new: false },
      { title: 'Comfortably Numb', artist: 'Pink Floyd', is_new: false },
      { title: 'Imagine', artist: 'John Lennon', is_new: false },
      { title: 'Yesterday', artist: 'The Beatles', is_new: false },
      { title: 'Nothing Else Matters', artist: 'Metallica', is_new: false },
      { title: 'Wish You Were Here', artist: 'Pink Floyd', is_new: false },
      { title: 'November Rain', artist: "Guns N' Roses", is_new: false },
      { title: 'Hallelujah', artist: 'Jeff Buckley', is_new: false },
      { title: 'The Night We Met', artist: 'Lord Huron', is_new: true },
      { title: 'Saturn', artist: 'Sleeping At Last', is_new: true },
      { title: 'Skinny Love', artist: 'Bon Iver', is_new: true },
      { title: 'Holocene', artist: 'Bon Iver', is_new: true },
      { title: 'To Build a Home', artist: 'The Cinematic Orchestra', is_new: true },
      { title: 'Re: Stacks', artist: 'Bon Iver', is_new: true },
      { title: 'Liability', artist: 'Lorde', is_new: true },
      { title: 'The Wolves (Act I and II)', artist: 'Bon Iver', is_new: true },
      { title: 'Cherry Wine', artist: 'Hozier', is_new: true },
      { title: 'Turning Page', artist: 'Sleeping At Last', is_new: true },
    ];
  }
}
