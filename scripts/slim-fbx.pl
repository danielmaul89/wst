use strict; use warnings;
use Compress::Raw::Zlib;

my ($in, $out) = @ARGV;
die "usage: slim-fbx.pl IN OUT\n" unless $in && $out;

my $data = do { local $/; open my $f,'<:raw',$in or die "$in: $!"; <$f> };
my $len = length $data;
die "not a binary FBX\n" unless substr($data,0,20) eq "Kaydara FBX Binary  ";
my $version = unpack 'V', substr($data,23,4);
die "unsupported FBX version $version\n" if $version >= 7500;

my $SCALAR = { Y=>2, C=>1, I=>4, F=>4, D=>8, L=>8 };
my %ARRAY = map { $_ => 1 } qw(f d l i b);

my $pos = 27;
my @top;
while (1) {
  my ($node, $next) = read_node($pos);
  last unless defined $node;
  push @top, $node;
  $pos = $next;
}
my $tail = substr($data, $pos + 13);   # null record then footer, kept verbatim

sub read_node {
  my ($off) = @_;
  my ($endOffset, $numProps, $propLen) = unpack 'VVV', substr($data, $off, 12);
  return (undef, $off) if $endOffset == 0;
  my $nameLen = unpack 'C', substr($data, $off + 12, 1);
  my $name = substr($data, $off + 13, $nameLen);
  my $p = $off + 13 + $nameLen;
  my @props;
  for (1 .. $numProps) {
    my $type = substr($data, $p, 1);
    $p++;
    my $prop = { type => $type };
    if ($SCALAR->{$type}) {
      $prop->{raw} = substr($data, $p, $SCALAR->{$type});
      $p += $SCALAR->{$type};
    } elsif ($type eq 'S' || $type eq 'R') {
      my $n = unpack 'V', substr($data, $p, 4);
      $prop->{raw} = substr($data, $p, 4 + $n);
      $p += 4 + $n;
    } elsif ($ARRAY{$type}) {
      my ($count, $enc, $clen) = unpack 'VVV', substr($data, $p, 12);
      $prop->{array} = { count => $count, enc => $enc, payload => substr($data, $p + 12, $clen) };
      $p += 12 + $clen;
    } else {
      die "unknown property type '$type' in $name at $off\n";
    }
    push @props, $prop;
  }
  my @kids;
  if ($p < $endOffset - 13) {
    while ($p < $endOffset - 13) {
      my ($kid, $next) = read_node($p);
      last unless defined $kid;
      push @kids, $kid;
      $p = $next;
    }
    $p += 13 if $p < $endOffset;   # child list terminator
  }
  return ({ name => $name, props => \@props, kids => \@kids }, $endOffset);
}

# ---- transforms -------------------------------------------------------
my %stat = (uvDropped => 0, layerEntries => 0, doubleArrays => 0, floatBytesSaved => 0);

sub prop_string {
  my ($prop) = @_;
  return undef unless $prop && $prop->{type} eq 'S';
  my $n = unpack 'V', substr($prop->{raw}, 0, 4);
  return substr($prop->{raw}, 4, $n);
}

sub inflate_payload {
  my ($arr) = @_;
  return $arr->{payload} if $arr->{enc} == 0;
  my ($i, $status) = Compress::Raw::Zlib::Inflate->new();
  my $outbuf = '';
  $i->inflate($arr->{payload}, $outbuf);
  return $outbuf;
}

sub deflate_payload {
  my ($raw) = @_;
  my ($d) = Compress::Raw::Zlib::Deflate->new(-Level => Z_BEST_COMPRESSION);
  my $outbuf = '';
  $d->deflate($raw, $outbuf);
  my $tailbuf = '';
  $d->flush($tailbuf);
  return $outbuf . $tailbuf;
}

sub transform {
  my ($node) = @_;
  my @keep;
  for my $kid (@{ $node->{kids} }) {
    if ($kid->{name} eq 'LayerElementUV') { $stat{uvDropped}++; next; }
    if ($kid->{name} eq 'LayerElement') {
      my ($typeNode) = grep { $_->{name} eq 'Type' } @{ $kid->{kids} };
      my $t = $typeNode ? prop_string($typeNode->{props}[0]) : '';
      if (defined $t && $t eq 'LayerElementUV') { $stat{layerEntries}++; next; }
    }
    push @keep, $kid;
  }
  $node->{kids} = \@keep;

  # Double arrays hold vertex positions and normals; three.js keeps both as
  # 32-bit floats anyway, so half of every one of those bytes is thrown away
  # on arrival.
  for my $prop (@{ $node->{props} }) {
    next unless $prop->{type} eq 'd';
    my $raw = inflate_payload($prop->{array});
    my @vals = unpack 'd<*', $raw;
    my $packed = pack 'f<*', @vals;
    my $before = length $prop->{array}{payload};
    my $payload = $prop->{array}{enc} ? deflate_payload($packed) : $packed;
    $stat{floatBytesSaved} += $before - length $payload;
    $stat{doubleArrays}++;
    $prop->{type} = 'f';
    $prop->{array}{payload} = $payload;
  }

  transform($_) for @{ $node->{kids} };
}

transform($_) for @top;

# ---- serialise --------------------------------------------------------
sub write_node {
  my ($node, $start) = @_;
  my $props = '';
  for my $prop (@{ $node->{props} }) {
    $props .= $prop->{type};
    if (exists $prop->{array}) {
      $props .= pack 'VVV', $prop->{array}{count}, $prop->{array}{enc}, length $prop->{array}{payload};
      $props .= $prop->{array}{payload};
    } else {
      $props .= $prop->{raw};
    }
  }
  my $header = 12 + 1 + length($node->{name});
  my $kidsStart = $start + $header + length($props);
  my $kids = '';
  if (@{ $node->{kids} }) {
    my $at = $kidsStart;
    for my $kid (@{ $node->{kids} }) {
      my $bytes = write_node($kid, $at);
      $kids .= $bytes;
      $at += length $bytes;
    }
    $kids .= "\0" x 13;
  }
  my $end = $kidsStart + length $kids;
  return pack('VVV', $end, scalar @{ $node->{props} }, length $props)
       . pack('C', length $node->{name}) . $node->{name} . $props . $kids;
}

my $body = '';
my $at = 27;
for my $node (@top) {
  my $bytes = write_node($node, $at);
  $body .= $bytes;
  $at += length $bytes;
}

my $result = substr($data, 0, 27) . $body . ("\0" x 13) . $tail;
open my $o, '>:raw', $out or die "$out: $!";
print $o $result;
close $o;

printf "in  %.2f MB\nout %.2f MB  (%.0f%% smaller)\nUV layers dropped: %d (+%d layer entries)\ndouble arrays to float: %d, saved %.2f MB compressed\n",
  $len/1048576, length($result)/1048576, 100*(1 - length($result)/$len),
  $stat{uvDropped}, $stat{layerEntries}, $stat{doubleArrays}, $stat{floatBytesSaved}/1048576;
