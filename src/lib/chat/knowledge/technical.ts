/**
 * The technical layer: signal, audio, lighting, comms.
 *
 * Kept at the level a working freelancer talks at — what the thing is for and what it is
 * called — rather than a spec sheet. Model numbers date fast; the roles they fill do not.
 */
export const TECHNICAL = `
## Broadcast standards

- **1080i/59.94** is still the dominant US broadcast delivery format for live network
  television. **720p/59.94** is used by broadcasters who standardised on it (historically ABC
  and Fox). Sports and events are increasingly acquired in **1080p** or **2160p (UHD)** and
  down-converted for the broadcast path.
- **Frame rate**: 59.94 and 29.97 in North America, 50 and 25 in most of Europe and much of
  Asia. This is why an international show carries conversion in the chain, and why a package
  cut for one region can judder in another.
- **HDR** — HLG and PQ (HDR10 / Dolby Vision) are both in use. Live sport most commonly uses
  **HLG** because it degrades gracefully to SDR, which matters when one feed serves both.
  Running an HDR and SDR path together means a shading team working to two monitors and a
  conversion LUT that has to be agreed before the show, not during it.
- **ATSC 3.0 ("NextGen TV")** is the US next-generation terrestrial standard — IP-based,
  supports UHD, HDR and immersive audio. Rollout is market by market and simulcast with ATSC
  1.0; it matters commercially more than it changes a show's production plan today.
- **SDI vs IP** — 12G-SDI carries UHD on one coax and is still the backbone in most trucks.
  **SMPTE ST 2110** moves video, audio and data as separate IP essence streams over a network,
  with **PTP** for timing. New builds and new trucks are increasingly 2110; the practical
  consequence is that the "patch" becomes a network configuration and the engineer's skill set
  shifts toward IT.
- **NDI** is a lighter compressed-IP protocol used widely in corporate, streaming and smaller
  productions rather than network broadcast.

## Video

- **Switcher (vision mixer)** — Grass Valley and Sony dominate large live broadcast; Ross is
  common in news, sports and corporate. Key concepts: **M/E** (mix/effect banks), **keyers**
  (luma, chroma, linear), **DVE** (digital video effects — the box moves and squeezes),
  **macros** (recorded sequences fired as one button for repeated show moments).
- **Replay** — **EVS** is the generic term in the way "Kleenex" is. Operators run angle groups
  and build highlight packages during play.
- **Router** — the matrix that lets any source reach any destination. The reason a compound of
  twelve trucks behaves as one facility.
- **CCU / RCP** — camera control, where the shader lives.
- **LED walls** — panels are specified by **pixel pitch** (millimetres between pixel centres:
  smaller is finer and more expensive, and dictates minimum camera distance before moiré).
  Driven by processors — **Brompton** and **Megapixel** are the common broadcast-grade names —
  which handle genlock, frame-rate sync to the cameras, and low-latency scaling. A wall that is
  not genlocked to the cameras will band or tear on screen even though it looks fine in the
  room.
- **Media servers** — disguise, Hippotizer, Pixera, Resolume and similar, for content playback
  and mapping.

## Audio

- **Console** — large live broadcast and music work runs on digital desks; the broadcast mix,
  monitor mix and music mix are usually three separate consoles and three separate operators.
- **Dante / AES67 / MADI** — audio transport over network or multicore. Dante dominates
  corporate and installed systems; MADI remains common in trucks; AES67 is the interop layer.
- **RF coordination** — every wireless mic, in-ear monitor and wireless comms pack needs a
  clear frequency, and intermodulation between them creates new interference that must be
  planned around. In the US the usable UHF spectrum has been repeatedly reduced by spectrum
  auctions, which is why coordination is now a specialist job on any show of size and why
  large events file for coordination with the venue and, where required, with regulators.
- **IEM (in-ear monitors)** — what performers hear. Failure here stops a musical number faster
  than anything on the video side.
- **Comms** — the intercom system. **Party line** (everyone on a channel hears everyone) versus
  **matrix** (point to point). Clear-Com and RTS are the standard names. **IFB (interruptible
  foldback)** is the feed to an on-air performer's ear: programme audio, interrupted by the
  producer or director talking. A presenter is listening to IFB, not comms.
- **Loudness** — broadcast delivery is loudness-normalised. In the US the CALM Act makes
  ATSC A/85 practice compulsory; internationally EBU R 128 is the equivalent. Target loudness
  is measured in **LKFS/LUFS** and the mix is built to it, not to a peak meter.

## Lighting

- **Consoles** — grandMA, ETC Eos and Hog are the common families on large shows.
- **Fixtures** — conventional tungsten is largely gone from new rigs; LED wash, LED profile
  and moving-head fixtures dominate. **Follow spots** persist on award shows and music,
  increasingly as remote-operated systems.
- **Designing for camera, not for the room.** Camera contrast latitude is narrower than the
  eye's, so key/fill ratios that look flat in person read correctly on air. Colour rendering
  matters: a fixture with poor spectral quality will make skin tones unfixable in shading.
- **Flicker** — LED fixtures and LED walls must be driven at refresh rates compatible with the
  camera shutter, or they strobe on air. High-speed cameras for replay make this harder, and
  it is a normal reason for a fixture to be rejected in tech.
- **DMX / sACN / Art-Net** — control protocols. Large rigs run sACN or Art-Net over a
  dedicated network with DMX at the fixture end.

## Graphics

**Vizrt**, **Chyron** and **Ross** are the common platforms. Real-time graphics on live sport
carry scores, clocks and data feeds; **AR (augmented reality)** graphics are tracked to camera
position so a virtual element sits in the real set, which requires camera tracking hardware and
a calibrated stage. Award shows use graphics comparatively lightly — nominee keys, lower
thirds, and the package end-boards.
`;
