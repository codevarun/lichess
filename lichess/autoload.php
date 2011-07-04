<?php

$vendorDir = realpath(__DIR__.'/../vendor');
$srcDir    = realpath(__DIR__.'/../src');

require $vendorDir.'/symfony/src/Symfony/Component/ClassLoader/ApcUniversalClassLoader.php';

$loader = new Symfony\Component\ClassLoader\ApcUniversalClassLoader('lichess.cl.');

$loader->registerNamespaces(array(
    'Symfony'                        => array($vendorDir.'/symfony/src', $srcDir),
    'Doctrine\\MongoDB'              => $vendorDir.'/doctrine-mongodb/lib',
    'Doctrine\\ODM\\MongoDB'         => $vendorDir.'/doctrine-mongodb-odm/lib',
    'Doctrine\\Common\\DataFixtures' => $vendorDir.'/doctrine-data-fixtures/lib',
    'Doctrine\\Common'               => $vendorDir.'/doctrine-common/lib',
    'DoctrineExtensions'             => $vendorDir.'/Doctrine2-Sluggable-Functional-Behavior/lib',
    'Zend'                           => $vendorDir.'/zend-subtrees',
    'Monolog'                        => $vendorDir.'/monolog/src',
    'Assetic'                        => $vendorDir.'/assetic/src',
    'Pagerfanta'                     => $vendorDir.'/pagerfanta/src',
    'WhiteOctober\PagerfantaBundle'  => $srcDir,
    'Bundle'                         => $srcDir,
    'FOS'                            => $srcDir,
    'FOQ'                            => $srcDir,
    'Lichess'                        => $srcDir,
    'Application'                    => $srcDir,
    'Ornicar'                        => $srcDir,
    'Sensio'                         => $srcDir,
));
$loader->registerPrefixes(array(
    'Twig_'  => $vendorDir.'/twig/lib'
));
$loader->register();

// doctrine annotations
Doctrine\Common\Annotations\AnnotationRegistry::registerLoader(function($class) use ($loader) {
    $loader->loadClass($class);
    return class_exists($class, false);
});
Doctrine\Common\Annotations\AnnotationRegistry::registerFile(__DIR__.'/../vendor/doctrine-mongodb-odm/lib/Doctrine/ODM/MongoDB/Mapping/Annotations/DoctrineAnnotations.php');
